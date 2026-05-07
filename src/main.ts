import { bootShell } from './shell/shell';
// Side-effect imports register each exhibit with the shell registry.
// Add new exhibits here as they ship; the URL-param selector in
// shell.ts then routes ?exhibit=<id> to the matching registration.
import './exhibits/quadrics';
import './exhibits/hello';

bootShell();
