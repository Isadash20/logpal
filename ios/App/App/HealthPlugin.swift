import Foundation
import Capacitor
import HealthKit

/**
 * LogPal's bridge to Apple Health.
 *
 * Six methods, kept inside the app rather than pulled in as a package: the
 * plugin ecosystem for HealthKit is thin, each option covers a different
 * half of what LogPal needs, and none of them tracks Capacitor majors
 * promptly. `MainViewController` registers it; `src/services/health.ts` is
 * the other side.
 *
 * Reads: steps (daily totals, de-duplicated across iPhone and Watch by
 * HealthKit's own statistics), body mass, workouts.
 * Writes: dietary water, body mass, dietary energy, protein, carbs and fat.
 *
 * Writes are "replace the day": every write deletes whatever LogPal itself
 * wrote for that day and type, then stores one sample with the new total.
 * That keeps Health equal to the diary without tracking sample ids, and it
 * never touches anything another app or the user wrote.
 */
@objc(HealthPlugin)
public class HealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthPlugin"
    public let jsName = "Health"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readDailySteps", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readWeights", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readWorkouts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeDay", returnType: CAPPluginReturnPromise),
    ]

    private let store = HKHealthStore()

    private static func qty(_ id: HKQuantityTypeIdentifier) -> HKQuantityType {
        HKObjectType.quantityType(forIdentifier: id)!
    }

    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    /// JS field name, Health type, unit the JS side sends.
    private static let writeFields: [(key: String, id: HKQuantityTypeIdentifier, unit: HKUnit)] = [
        ("waterMl", .dietaryWater, HKUnit.literUnit(with: .milli)),
        ("calories", .dietaryEnergyConsumed, HKUnit.kilocalorie()),
        ("proteinG", .dietaryProtein, HKUnit.gram()),
        ("carbsG", .dietaryCarbohydrates, HKUnit.gram()),
        ("fatG", .dietaryFatTotal, HKUnit.gram()),
        ("weightKg", .bodyMass, HKUnit.gramUnit(with: .kilo)),
    ]

    private var readTypes: Set<HKObjectType> {
        [HealthPlugin.qty(.stepCount), HealthPlugin.qty(.bodyMass), HKObjectType.workoutType()]
    }

    private var writeTypes: Set<HKSampleType> {
        Set(HealthPlugin.writeFields.map { HealthPlugin.qty($0.id) })
    }

    // MARK: - dates

    /// Days are cut in the zone the app says it is logging in, which is the
    /// device's unless the user chose otherwise in Language & region.
    private func calendar(_ call: CAPPluginCall) -> Calendar {
        var cal = Calendar(identifier: .gregorian)
        if let tz = call.getString("timeZone"), let zone = TimeZone(identifier: tz) {
            cal.timeZone = zone
        }
        return cal
    }

    private func dayFormatter(_ cal: Calendar) -> DateFormatter {
        let f = DateFormatter()
        f.calendar = cal
        f.timeZone = cal.timeZone
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }

    // MARK: - availability and permission

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Health data is not available on this device")
            return
        }
        store.requestAuthorization(toShare: writeTypes, read: readTypes) { ok, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            call.resolve(["granted": ok, "writes": self.writeStatusMap()])
        }
    }

    /// HealthKit only ever reveals whether *writing* was allowed; a read that
    /// was refused simply comes back empty, by design.
    @objc func writeStatus(_ call: CAPPluginCall) {
        call.resolve(["writes": writeStatusMap()])
    }

    private func writeStatusMap() -> [String: String] {
        var out: [String: String] = [:]
        for field in HealthPlugin.writeFields {
            switch store.authorizationStatus(for: HealthPlugin.qty(field.id)) {
            case .sharingAuthorized: out[field.key] = "authorized"
            case .sharingDenied: out[field.key] = "denied"
            default: out[field.key] = "notDetermined"
            }
        }
        return out
    }

    // MARK: - reads

    @objc func readDailySteps(_ call: CAPPluginCall) {
        let cal = calendar(call)
        let fmt = dayFormatter(cal)
        guard let s = call.getString("start"), let e = call.getString("end"),
              let startDay = fmt.date(from: s), let endDay = fmt.date(from: e) else {
            call.reject("start and end must be YYYY-MM-DD")
            return
        }
        let start = cal.startOfDay(for: startDay)
        let end = cal.date(byAdding: .day, value: 1, to: cal.startOfDay(for: endDay))!
        let pred = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKStatisticsCollectionQuery(
            quantityType: HealthPlugin.qty(.stepCount),
            quantitySamplePredicate: pred,
            options: .cumulativeSum,
            anchorDate: start,
            intervalComponents: DateComponents(day: 1)
        )
        query.initialResultsHandler = { _, result, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            var days: [[String: Any]] = []
            result?.enumerateStatistics(from: start, to: end) { stat, _ in
                let n = stat.sumQuantity()?.doubleValue(for: HKUnit.count()) ?? 0
                days.append(["date": fmt.string(from: stat.startDate), "steps": Int(n.rounded())])
            }
            call.resolve(["days": days])
        }
        store.execute(query)
    }

    @objc func readWeights(_ call: CAPPluginCall) {
        let cal = calendar(call)
        let fmt = dayFormatter(cal)
        guard let s = call.getString("start"), let startDay = fmt.date(from: s) else {
            call.reject("start must be YYYY-MM-DD")
            return
        }
        let pred = HKQuery.predicateForSamples(withStart: cal.startOfDay(for: startDay), end: nil, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(
            sampleType: HealthPlugin.qty(.bodyMass),
            predicate: pred,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: [sort]
        ) { _, samples, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            let me = Bundle.main.bundleIdentifier
            let out: [[String: Any]] = (samples as? [HKQuantitySample] ?? []).map { sample in
                [
                    "date": fmt.string(from: sample.startDate),
                    "at": HealthPlugin.iso.string(from: sample.startDate),
                    "kg": sample.quantity.doubleValue(for: HKUnit.gramUnit(with: .kilo)),
                    "own": sample.sourceRevision.source.bundleIdentifier == me,
                    "source": sample.sourceRevision.source.name,
                ]
            }
            call.resolve(["samples": out])
        }
        store.execute(query)
    }

    @objc func readWorkouts(_ call: CAPPluginCall) {
        let cal = calendar(call)
        let fmt = dayFormatter(cal)
        guard let s = call.getString("start"), let startDay = fmt.date(from: s) else {
            call.reject("start must be YYYY-MM-DD")
            return
        }
        let pred = HKQuery.predicateForSamples(withStart: cal.startOfDay(for: startDay), end: nil, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let query = HKSampleQuery(
            sampleType: HKObjectType.workoutType(),
            predicate: pred,
            limit: HKObjectQueryNoLimit,
            sortDescriptors: [sort]
        ) { _, samples, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            let me = Bundle.main.bundleIdentifier
            let out: [[String: Any]] = (samples as? [HKWorkout] ?? []).map { w in
                var row: [String: Any] = [
                    "id": w.uuid.uuidString,
                    "date": fmt.string(from: w.startDate),
                    "start": HealthPlugin.iso.string(from: w.startDate),
                    "end": HealthPlugin.iso.string(from: w.endDate),
                    "minutes": w.duration / 60,
                    "activity": HealthPlugin.activityName(w.workoutActivityType),
                    "source": w.sourceRevision.source.name,
                    "own": w.sourceRevision.source.bundleIdentifier == me,
                ]
                if let kcal = HealthPlugin.energy(of: w) {
                    row["calories"] = kcal
                }
                if let mi = HealthPlugin.distanceMiles(of: w) {
                    row["distanceMi"] = mi
                }
                if let ft = HealthPlugin.elevationFeet(of: w) {
                    row["elevationFt"] = ft
                }
                return row
            }
            call.resolve(["workouts": out])
        }
        store.execute(query)
    }

    private static func energy(of w: HKWorkout) -> Double? {
        if #available(iOS 16.0, *) {
            if let q = w.statistics(for: qty(.activeEnergyBurned))?.sumQuantity() {
                return q.doubleValue(for: HKUnit.kilocalorie())
            }
        }
        return w.totalEnergyBurned?.doubleValue(for: HKUnit.kilocalorie())
    }

    /// Distance the workout covered, from whichever distance type the
    /// activity records (Strava, Garmin and the Watch all fill one of them).
    private static func distanceMiles(of w: HKWorkout) -> Double? {
        if #available(iOS 16.0, *) {
            var ids: [HKQuantityTypeIdentifier] = [
                .distanceWalkingRunning, .distanceCycling, .distanceSwimming,
                .distanceDownhillSnowSports, .distanceWheelchair,
            ]
            if #available(iOS 18.0, *) {
                ids += [.distancePaddleSports, .distanceRowing, .distanceSkatingSports, .distanceCrossCountrySkiing]
            }
            for id in ids {
                if let q = w.statistics(for: qty(id))?.sumQuantity() {
                    let m = q.doubleValue(for: HKUnit.meter())
                    if m > 0 { return m / 1609.344 }
                }
            }
        }
        if let m = w.totalDistance?.doubleValue(for: HKUnit.meter()), m > 0 {
            return m / 1609.344
        }
        return nil
    }

    /// Elevation gain, which apps store in the workout's metadata.
    private static func elevationFeet(of w: HKWorkout) -> Double? {
        if let q = w.metadata?[HKMetadataKeyElevationAscended] as? HKQuantity {
            let m = q.doubleValue(for: HKUnit.meter())
            if m > 0 { return m / 0.3048 }
        }
        return nil
    }

    // MARK: - writes

    @objc func writeDay(_ call: CAPPluginCall) {
        let cal = calendar(call)
        let fmt = dayFormatter(cal)
        guard let d = call.getString("date"), let day = fmt.date(from: d) else {
            call.reject("date must be YYYY-MM-DD")
            return
        }
        let dayStart = cal.startOfDay(for: day)
        let dayEnd = cal.date(byAdding: .day, value: 1, to: dayStart)!
        let now = Date()
        guard dayStart <= now else {
            call.reject("Cannot write a day that has not started")
            return
        }
        /* Noon, or now if the day is today and it is still morning: Health
           refuses samples dated in the future. */
        let at = min(cal.date(byAdding: .hour, value: 12, to: dayStart)!, now)
        let own = HKQuery.predicateForObjects(from: HKSource.default())
        let inDay = HKQuery.predicateForSamples(withStart: dayStart, end: dayEnd, options: [])
        let mine = NSCompoundPredicate(andPredicateWithSubpredicates: [own, inDay])

        let group = DispatchGroup()
        let lock = NSLock()
        var firstError: Error?
        var written = 0
        var skipped: [String] = []

        for field in HealthPlugin.writeFields {
            guard let value = call.getDouble(field.key) else { continue }
            let type = HealthPlugin.qty(field.id)
            guard store.authorizationStatus(for: type) == .sharingAuthorized else {
                skipped.append(field.key)
                continue
            }
            group.enter()
            store.deleteObjects(of: type, predicate: mine) { _, _, _ in
                /* Nothing to delete is not a failure. */
                guard value > 0 else {
                    group.leave()
                    return
                }
                let sample = HKQuantitySample(
                    type: type,
                    quantity: HKQuantity(unit: field.unit, doubleValue: value),
                    start: at,
                    end: at,
                    metadata: [HKMetadataKeyWasUserEntered: true]
                )
                self.store.save(sample) { ok, error in
                    lock.lock()
                    if let error = error, firstError == nil { firstError = error }
                    if ok { written += 1 }
                    lock.unlock()
                    group.leave()
                }
            }
        }

        group.notify(queue: .main) {
            if let error = firstError {
                call.reject(error.localizedDescription)
            } else {
                call.resolve(["written": written, "skipped": skipped])
            }
        }
    }

    // MARK: - names

    private static func activityName(_ t: HKWorkoutActivityType) -> String {
        switch t {
        case .running: return "Running"
        case .trackAndField: return "Track & Field"
        case .wrestling: return "Wrestling"
        case .waterPolo: return "Water Polo"
        case .lacrosse: return "Lacrosse"
        case .rugby: return "Rugby"
        case .cricket: return "Cricket"
        case .handball: return "Handball"
        case .fencing: return "Fencing"
        case .gymnastics: return "Gymnastics"
        case .archery: return "Archery"
        case .bowling: return "Bowling"
        case .curling: return "Curling"
        case .sailing: return "Sailing"
        case .equestrianSports: return "Horseback Riding"
        case .stairs: return "Stair Climbing"
        case .stepTraining: return "Step Aerobics"
        case .discSports: return "Ultimate Frisbee"
        case .swimBikeRun: return "Triathlon"
        case .hunting, .fishing: return "Workout"
        case .snowSports: return "Downhill Skiing"
        case .waterFitness: return "Water Aerobics"
        case .waterSports: return "Paddleboarding"
        case .australianFootball: return "Football"
        case .preparationAndRecovery: return "Mobility Work"
                case .walking: return "Walking"
        case .cycling: return "Cycling"
        case .hiking: return "Hiking"
        case .swimming: return "Swimming"
        case .rowing: return "Rowing"
        case .elliptical: return "Elliptical"
        case .stairClimbing: return "Stair Climber"
        case .traditionalStrengthTraining: return "Strength Training"
        case .functionalStrengthTraining: return "Functional Training"
        case .highIntensityIntervalTraining: return "HIIT"
        case .yoga: return "Yoga"
        case .pilates: return "Pilates"
        case .dance, .socialDance, .cardioDance: return "Dancing"
        case .coreTraining: return "Core Training"
        case .flexibility: return "Stretching"
        case .cooldown: return "Cooldown"
        case .mixedCardio: return "Cardio"
        case .crossTraining: return "Circuit Training"
        case .jumpRope: return "Jump Rope"
        case .kickboxing: return "Kickboxing"
        case .boxing: return "Boxing"
        case .martialArts: return "Martial Arts"
        case .soccer: return "Soccer"
        case .basketball: return "Basketball"
        case .tennis: return "Tennis"
        case .pickleball: return "Pickleball"
        case .golf: return "Golf"
        case .baseball: return "Baseball"
        case .softball: return "Softball"
        case .volleyball: return "Volleyball"
        case .americanFootball: return "Football"
        case .hockey: return "Ice Hockey"
        case .skatingSports: return "Ice Skating"
        case .snowboarding: return "Snowboarding"
        case .downhillSkiing: return "Downhill Skiing"
        case .crossCountrySkiing: return "Cross-Country Skiing"
        case .surfingSports: return "Surfing"
        case .paddleSports: return "Kayaking"
        case .climbing: return "Rock Climbing"
        case .wheelchairWalkPace, .wheelchairRunPace: return "Wheelchair"
        case .handCycling: return "Cycling"
        case .tableTennis: return "Table Tennis"
        case .badminton: return "Badminton"
        case .racquetball: return "Racquetball"
        case .squash: return "Squash"
        case .taiChi: return "Tai Chi"
        case .barre: return "Barre"
        case .mindAndBody: return "Stretching"
        case .play: return "Play"
        case .fitnessGaming: return "Workout"
        case .other: return "Workout"
        default: return "Workout"
        }
    }
}
