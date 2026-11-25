/**
 * Security Events - Pre-deploy Checks panel and the free light security scans
 *
 * Names are low-cardinality on purpose: no file names, addresses or code.
 */

import { MatomoEventBase } from '../core/base-types';

/** The Pre-deploy Checks panel. */
export interface PreDeployChecksEvent extends MatomoEventBase {
  category: 'preDeployChecks';
  action:
    | 'open' // name = where it was opened from: contextMenu | pasteGuard | statusbar | deployStatus | compiler
    | 'run' // name = start, value = the enabled steps, e.g. "compile,analysis,ai"
    | 'runResult' // name = clear | issues | blocked | compileFailed | cancelled | error, value = open high issues
    | 'toggle' // name = <step>-on | <step>-off
    | 'issue' // name = open-<tool> | ignore-<reason> | restore
    | 'deploy' // name = goToDeploy | deployAnyway (open high issues)
    | 'report' // name = save | gated
    | 'upgrade' // name = issueGate | reportGate | fullAudit (a full audit asked for without the Security Auditor)
    | 'securityAudit'; // name = where the full audit was asked for: checks | issue | toolLine | pasteGuard | deployCard
}

/** The free light security scans: after a paste (paste guard), after a deploy (Deployed Contracts card), status bar. */
export interface SecurityScanEvent extends MatomoEventBase {
  category: 'securityScan';
  action:
    | 'result' // name = paste-<status> | deploy-<status>
    | 'guard' // name = the paste guard view shown: signin | offer | exhausted | scanning | issues | clear | warn | error | unavailable
    | 'cta' // name = <surface>-<button>, e.g. paste-signin, card-fullAudit, statusbar-paste-issues
    | 'gated' // name = paste | card | checks: blurred details shown to a user without the Security Auditor
    | 'setting'; // name = autoScan-on | autoScan-off (Settings → Automatic AI security checks)
}
