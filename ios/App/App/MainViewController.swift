import UIKit
import Capacitor

/**
 * The bridge view controller, subclassed only to register plugins that live
 * in this app rather than in a package. Main.storyboard points at it.
 */
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(HealthPlugin())
    }
}
