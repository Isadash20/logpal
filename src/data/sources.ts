/**
 * Where LogPal's numbers come from.
 *
 * Every calculation or recommendation the app makes points at the published
 * source behind it, in plain words, with a link the user can open. App Review
 * (guideline 1.4.1, 2026-11-19) asked for exactly this: health figures in
 * the app must cite where they come from, and the citations must be easy to
 * find. The Sources screen lists all of them; each screen that shows a figure
 * links to its own section.
 */
export type SourceTopic =
  | 'calories'
  | 'macros'
  | 'water'
  | 'exercise'
  | 'steps'
  | 'sleep'
  | 'fasting'
  | 'score'
  | 'food'

export interface Source {
  title: string
  /** Who published it and when. */
  publisher: string
  url: string
  /** What LogPal takes from it, one sentence. */
  usedFor: string
}

export interface SourceSection {
  topic: SourceTopic
  heading: string
  /** How the app uses these, in one or two sentences. */
  summary: string
  sources: Source[]
}

export const SOURCE_SECTIONS: SourceSection[] = [
  {
    topic: 'calories',
    heading: 'Calorie target',
    summary:
      'Your resting burn (BMR) is the Mifflin-St Jeor equation. It is multiplied by an activity factor for everyday movement, then adjusted by 3,500 calories per pound of weekly change. Targets under 1,200 (women) or 1,500 (men) calories a day are flagged.',
    sources: [
      {
        title: 'A new predictive equation for resting energy expenditure in healthy individuals',
        publisher: 'Mifflin MD et al., American Journal of Clinical Nutrition, 1990',
        url: 'https://pubmed.ncbi.nlm.nih.gov/2305711/',
        usedFor: 'The BMR equation.',
      },
      {
        title: 'Validity of predictive equations for resting metabolic rate in healthy nonobese and obese adults',
        publisher: 'Frankenfield D et al., Journal of the American Dietetic Association, 2005',
        url: 'https://pubmed.ncbi.nlm.nih.gov/15883556/',
        usedFor: 'Why Mifflin-St Jeor is used rather than Harris-Benedict.',
      },
      {
        title: 'Human energy requirements: Report of a Joint FAO/WHO/UNU Expert Consultation',
        publisher: 'FAO, WHO and the United Nations University, 2004',
        url: 'https://www.fao.org/4/y5686e/y5686e00.htm',
        usedFor: 'The activity multipliers (physical activity levels) applied to BMR.',
      },
      {
        title: 'Quantification of the effect of energy imbalance on bodyweight',
        publisher: 'Hall KD et al., The Lancet, 2011',
        url: 'https://pubmed.ncbi.nlm.nih.gov/21872751/',
        usedFor: 'The 3,500 calories per pound rule of thumb, and why real weight change is slower than it predicts.',
      },
      {
        title: 'Steps for Losing Weight',
        publisher: 'US Centers for Disease Control and Prevention',
        url: 'https://www.cdc.gov/healthy-weight-growth/losing-weight/index.html',
        usedFor: 'A gradual pace of 1 to 2 pounds a week.',
      },
      {
        title: 'Guidelines (2013) for Managing Overweight and Obesity in Adults',
        publisher: 'Jensen MD et al., American Heart Association / American College of Cardiology / The Obesity Society',
        url: 'https://pubmed.ncbi.nlm.nih.gov/24222017/',
        usedFor: 'The 1,200 and 1,500 calorie floors under which a target is flagged.',
      },
    ],
  },
  {
    topic: 'macros',
    heading: 'Protein, carbohydrate and fat',
    summary:
      'The default split is 50% carbohydrate, 20% protein and 30% fat of your calorie target, inside the accepted ranges below. Calories per gram are the Atwater factors: 4 for carbohydrate and protein, 9 for fat, 7 for alcohol.',
    sources: [
      {
        title: 'Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol, Protein, and Amino Acids',
        publisher: 'National Academies of Sciences, Engineering, and Medicine, 2005',
        url: 'https://nap.nationalacademies.org/catalog/10490',
        usedFor: 'The acceptable macronutrient ranges (45-65% carbohydrate, 10-35% protein, 20-35% fat) and the 0.8 g/kg protein RDA.',
      },
      {
        title: 'Dietary Guidelines for Americans, 2020-2025',
        publisher: 'US Departments of Agriculture and Health and Human Services',
        url: 'https://www.dietaryguidelines.gov/',
        usedFor: 'Limits on added sugars (under 10% of calories), saturated fat (under 10%) and sodium (under 2,300 mg a day).',
      },
      {
        title: 'International Society of Sports Nutrition Position Stand: protein and exercise',
        publisher: 'Jäger R et al., Journal of the International Society of Sports Nutrition, 2017',
        url: 'https://pubmed.ncbi.nlm.nih.gov/28642676/',
        usedFor: 'Higher protein (1.4-2.0 g/kg) for people who train.',
      },
      {
        title: 'Energy Value of Foods: Basis and Derivation (Agriculture Handbook No. 74)',
        publisher: 'Merrill AL and Watt BK, US Department of Agriculture, 1973',
        url: 'https://www.ars.usda.gov/arsuserfiles/80400535/data/classics/ah74.pdf',
        usedFor: 'The 4-4-9 calories-per-gram factors.',
      },
    ],
  },
  {
    topic: 'water',
    heading: 'Water target',
    summary:
      'The target starts from body weight (about 30-38 ml per kilogram, less with age), adds an allowance for activity level, height and logged exercise, and is kept between 1.4 and 5 litres. It counts all drinks, not only plain water.',
    sources: [
      {
        title: 'Dietary Reference Intakes for Water, Potassium, Sodium, Chloride, and Sulfate',
        publisher: 'National Academies of Sciences, Engineering, and Medicine, 2005',
        url: 'https://nap.nationalacademies.org/catalog/10925',
        usedFor: 'Adequate intakes of about 2.7 L (women) and 3.7 L (men) of total water a day, and that food and all beverages count.',
      },
      {
        title: 'Water, Hydration and Health',
        publisher: 'Popkin BM et al., Nutrition Reviews, 2010',
        url: 'https://pubmed.ncbi.nlm.nih.gov/20646222/',
        usedFor: 'Per-kilogram estimates and why needs fall with age.',
      },
      {
        title: 'Exercise and Fluid Replacement (Position Stand)',
        publisher: 'American College of Sports Medicine, 2007',
        url: 'https://pubmed.ncbi.nlm.nih.gov/17277604/',
        usedFor: 'The extra fluid added per minute of logged exercise.',
      },
    ],
  },
  {
    topic: 'exercise',
    heading: 'Exercise calories',
    summary:
      'Calories burned are MET values (the energy cost of an activity relative to rest) times body weight times time, with speed and elevation refining the MET where a workout has them. Strength work is not added back; its cost is already inside your activity level.',
    sources: [
      {
        title: '2011 Compendium of Physical Activities: a second update of codes and MET values',
        publisher: 'Ainsworth BE et al., Medicine & Science in Sports & Exercise, 2011',
        url: 'https://pubmed.ncbi.nlm.nih.gov/21681120/',
        usedFor: 'The MET value of every activity in the exercise list.',
      },
      {
        title: 'The Compendium of Physical Activities (online)',
        publisher: 'Arizona State University, continually updated',
        url: 'https://pacompendium.com/',
        usedFor: 'MET values by walking, running and cycling speed.',
      },
      {
        title: 'Energy expenditure of walking and running: comparison with prediction equations',
        publisher: 'Hall C et al., Medicine & Science in Sports & Exercise, 2004',
        url: 'https://pubmed.ncbi.nlm.nih.gov/15570150/',
        usedFor: 'The calories-per-mile figure behind the step estimate.',
      },
    ],
  },
  {
    topic: 'steps',
    heading: 'Daily steps',
    summary:
      'The default target is 10,000 steps a day, a common goal; research shows benefit rising steeply up to about 7,000-8,000 and levelling off after. The target is yours to move.',
    sources: [
      {
        title: 'Daily steps and all-cause mortality: a meta-analysis of 15 international cohorts',
        publisher: 'Paluch AE et al., The Lancet Public Health, 2022',
        url: 'https://pubmed.ncbi.nlm.nih.gov/35247352/',
        usedFor: 'Where the benefit of extra steps levels off.',
      },
      {
        title: 'WHO guidelines on physical activity and sedentary behaviour',
        publisher: 'World Health Organization, 2020',
        url: 'https://www.who.int/publications/i/item/9789240015128',
        usedFor: 'The 150-300 minutes a week of moderate activity that the targets are meant to support.',
      },
    ],
  },
  {
    topic: 'sleep',
    heading: 'Sleep target',
    summary: 'The default nightly target is 8 hours, in the 7-or-more range recommended for adults.',
    sources: [
      {
        title: 'Recommended Amount of Sleep for a Healthy Adult: a Joint Consensus Statement',
        publisher: 'American Academy of Sleep Medicine and Sleep Research Society, 2015',
        url: 'https://pubmed.ncbi.nlm.nih.gov/25979105/',
        usedFor: 'Seven or more hours a night for adults.',
      },
      {
        title: 'How Much Sleep Do I Need?',
        publisher: 'US Centers for Disease Control and Prevention',
        url: 'https://www.cdc.gov/sleep/about/index.html',
        usedFor: 'Recommended hours by age.',
      },
    ],
  },
  {
    topic: 'fasting',
    heading: 'Intermittent fasting',
    summary:
      'The fasting timer is a clock, not a prescription. The schedules offered are the ones studied below; the evidence says time-restricted eating works mainly by lowering calories, and it is not for everyone.',
    sources: [
      {
        title: 'Effects of Intermittent Fasting on Health, Aging, and Disease',
        publisher: 'de Cabo R and Mattson MP, New England Journal of Medicine, 2019',
        url: 'https://pubmed.ncbi.nlm.nih.gov/31881139/',
        usedFor: 'The overview of fasting schedules and what is known about them.',
      },
      {
        title: 'Calorie Restriction with or without Time-Restricted Eating in Weight Loss',
        publisher: 'Liu D et al., New England Journal of Medicine, 2022',
        url: 'https://pubmed.ncbi.nlm.nih.gov/35443107/',
        usedFor: 'Time-restricted eating adds little beyond the calorie reduction it causes.',
      },
      {
        title: 'Intermittent Fasting: What are the health benefits?',
        publisher: 'Johns Hopkins Medicine',
        url: 'https://www.hopkinsmedicine.org/health/wellness-and-prevention/intermittent-fasting-what-is-it-and-how-does-it-work',
        usedFor: 'Who should not fast without medical advice.',
      },
    ],
  },
  {
    topic: 'score',
    heading: 'Nutrition score and source ratings',
    summary:
      'The 1-10 score and the protein, carbohydrate, fat and "clean" ratings are LogPal\'s own arithmetic over the nutrients on the label, judged against the FDA daily values and the limits in the dietary guidelines. They are a shorthand, not a medical grading.',
    sources: [
      {
        title: 'Daily Value on the Nutrition and Supplement Facts Labels',
        publisher: 'US Food and Drug Administration',
        url: 'https://www.fda.gov/food/nutrition-facts-label/daily-value-nutrition-and-supplement-facts-labels',
        usedFor: 'The daily values each nutrient is judged against.',
      },
      {
        title: 'Dietary Guidelines for Americans, 2020-2025',
        publisher: 'US Departments of Agriculture and Health and Human Services',
        url: 'https://www.dietaryguidelines.gov/',
        usedFor: 'Which nutrients count for and which against, and why dietary cholesterol is not scored.',
      },
      {
        title: 'Guideline: Sugars intake for adults and children',
        publisher: 'World Health Organization, 2015',
        url: 'https://www.who.int/publications/i/item/9789241549028',
        usedFor: 'The added-sugar limit used in the "clean" rating.',
      },
    ],
  },
  {
    topic: 'food',
    heading: 'Food nutrition data',
    summary: 'Whole foods come from the US Department of Agriculture; packaged products from Open Food Facts, a public database kept by volunteers, so check a label when a packet matters.',
    sources: [
      {
        title: 'FoodData Central',
        publisher: 'US Department of Agriculture, Agricultural Research Service',
        url: 'https://fdc.nal.usda.gov/',
        usedFor: 'Nutrition for whole and generic foods.',
      },
      {
        title: 'Open Food Facts',
        publisher: 'Open Food Facts, a non-profit',
        url: 'https://world.openfoodfacts.org/',
        usedFor: 'Barcodes and packaged products.',
      },
    ],
  },
]

export const SOURCE_SECTION_BY_TOPIC = Object.fromEntries(
  SOURCE_SECTIONS.map((s) => [s.topic, s])
) as Record<SourceTopic, SourceSection>
