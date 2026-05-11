import { bootShell } from './shell/shell';
// Side-effect imports register each exhibit with the shell registry.
// Add new exhibits here as they ship; the URL-param selector in
// shell.ts then routes ?exhibit=<id> to the matching registration.
//
// Order matters: `registerExhibit` appends in import order, the shell's
// cluster filter preserves it, and `clusterExhibits[0]` is the bare-URL
// boot default. Quadrics stays first (cluster default + first SceneRack
// tab); tangent-planes second; gradient-levels third; saddle-extrema
// fourth (pre-warmed as non-default siblings at boot). `hello` stays
// last — cluster-less, filtered out of the rack.
import './exhibits/quadrics';
import './exhibits/tangent-planes';
import './exhibits/gradient-levels';
import './exhibits/saddle-extrema';
import './exhibits/hello';

bootShell();
