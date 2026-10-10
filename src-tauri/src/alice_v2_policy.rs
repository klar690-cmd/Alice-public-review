//! Pure offline policy helpers. No credential, filesystem, network, IPC or process access.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone, Debug, PartialEq)]
pub struct EffectiveCodexPolicy {
    approval: Value,
    sandbox: String,
}

impl EffectiveCodexPolicy {
    pub fn parse(raw: &str, sandbox: &str) -> Result<Self, String> {
        if !matches!(sandbox, "read-only" | "workspace-write") {
            return Err("BLOCKED_UNSUPPORTED_SANDBOX".into());
        }
        let approval: Value = serde_json::from_str(raw)
            .map_err(|_| "BLOCKED_UNSUPPORTED_APPROVAL_POLICY".to_string())?;
        let known = match &approval {
            Value::String(mode) => matches!(mode.as_str(), "never" | "on-request"),
            Value::Object(object) if object.len() == 1 => object
                .get("granular")
                .and_then(Value::as_object)
                .is_some_and(|flags| {
                    !flags.is_empty()
                        && flags.iter().all(|(key, value)| {
                            matches!(key.as_str(), "sandbox_approval" | "request_permissions" | "rules" | "skill_approval" | "mcp_elicitations")
                                && value.is_boolean()
                        })
                }),
            _ => false,
        };
        if !known {
            return Err("BLOCKED_UNSUPPORTED_APPROVAL_POLICY".into());
        }
        Ok(Self { approval, sandbox: sandbox.into() })
    }

    pub fn approval(&self) -> Value {
        self.approval.clone()
    }

    pub fn turn_params(&self, cwd: &str, thread_id: &str, text: &str) -> Value {
        let sandbox = if self.sandbox == "read-only" {
            json!({ "type": "readOnly" })
        } else {
            json!({ "type": "workspaceWrite", "writableRoots": [cwd], "networkAccess": false,
                "excludeTmpdirEnvVar": true, "excludeSlashTmp": true })
        };
        json!({ "threadId": thread_id, "input": [{ "type": "text", "text": text }],
            "approvalPolicy": self.approval, "sandboxPolicy": sandbox })
    }
}

pub fn structured_worker_policy(agent: &str, raw: &str, sandbox: &str) -> Result<(), String> {
    match agent {
        "codex" => EffectiveCodexPolicy::parse(raw, sandbox).map(|_| ()),
        "claude" if sandbox == "read-only" => Err("BLOCKED_UNSUPPORTED_CLAUDE_READ_ONLY".into()),
        // A safe permissions control channel has not been implemented in this stream worker.
        "claude" => Err("BLOCKED_UNSUPPORTED_CLAUDE_PERMISSION_CHANNEL".into()),
        _ => Err("BLOCKED_UNSUPPORTED_PROVIDER".into()),
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Scope {
    pub project_id: String,
    pub graph_revision: u64,
    pub node_id: String,
    pub run_id: String,
    pub attempt_id: String,
    pub provider: String,
    pub mode: String,
}

/// An offline fixture, not a signed production authority or credential vault.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OfflineGrant {
    pub scope: Scope,
    pub grant_id: String,
    pub action: String,
    pub tools: Vec<String>,
    pub approval_policy: String,
    pub sandbox: String,
    pub workspace_root: String,
    pub auth_ref: String,
    pub session_ref: Option<String>,
    pub starts_at_ms: u64,
    pub expires_at_ms: u64,
    pub nonce: String,
    pub approval_ref: String,
    pub reservation_id: String,
    pub budget_units: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct OfflineRequest {
    pub scope: Scope,
    pub action: String,
    pub tools: Vec<String>,
    pub approval_policy: String,
    pub sandbox: String,
    pub auth_ref: String,
    pub session_ref: Option<String>,
    pub cwd: String,
    pub cost_units: u64,
}

#[derive(Clone, Debug)]
pub struct OfflineFacts {
    pub now_ms: u64,
    pub workspace_root: String,
    pub canonical_root: String,
    pub canonical_cwd: String,
    pub auth_scope: Scope,
    pub auth_ref: String,
    pub approved_grant_id: String,
    pub approved_nonce: String,
    pub approval_ref: String,
    pub reservation_id: String,
    pub reservation_project_id: String,
    pub remaining_units: Option<u64>,
    pub spent_nonces: Vec<String>,
}

fn path(value: &str) -> Option<String> {
    let normalized = value.replace('\\', "/").to_ascii_lowercase();
    let bytes = normalized.as_bytes();
    if bytes.len() < 4 || !bytes[0].is_ascii_alphabetic() || &bytes[1..3] != b":/" {
        return None;
    }
    for segment in normalized[3..].split('/') {
        let stem = segment.split('.').next().unwrap_or_default();
        if segment.is_empty() || matches!(segment, "." | "..")
            || segment.ends_with(' ') || segment.ends_with('.')
            || !segment.bytes().all(|b| b.is_ascii_alphanumeric() || b" _.-".contains(&b))
            || matches!(stem, "con" | "prn" | "aux" | "nul")
            || (stem.len() == 4 && (stem.starts_with("com") || stem.starts_with("lpt")) && matches!(stem.as_bytes()[3], b'1'..=b'9')) {
            return None;
        }
    }
    Some(normalized)
}

fn same_scope(a: &Scope, b: &Scope) -> bool {
    a.project_id == b.project_id && a.graph_revision == b.graph_revision && a.node_id == b.node_id
        && a.run_id == b.run_id && a.attempt_id == b.attempt_id && a.provider == b.provider && a.mode == b.mode
}

fn id(value: &str) -> bool {
    !value.starts_with("sk-") && !value.is_empty() && value.len() <= 96 && value.as_bytes()[0].is_ascii_alphanumeric()
        && value.bytes().all(|b| b.is_ascii_alphanumeric() || b"_-".contains(&b))
}

fn opaque_auth_ref(value: &str) -> bool {
    value.strip_prefix("authref:").is_some_and(|name| id(name) && name.len() <= 64
        && name.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"_-".contains(&b))
        && !name.starts_with("sk-"))
}

/// Returns only offline eligibility. The caller must never treat this as permission to spawn.
pub fn evaluate_offline(grant: Option<&OfflineGrant>, request: &OfflineRequest, facts: &OfflineFacts) -> Result<&'static str, &'static str> {
    let grant = grant.ok_or("NO_GRANT")?;
    if [&grant.scope.project_id, &grant.scope.node_id, &grant.scope.run_id, &grant.scope.attempt_id,
        &grant.grant_id, &grant.nonce, &grant.approval_ref, &grant.reservation_id].iter().any(|v| !id(v)) {
        return Err("MALFORMED");
    }
    if !same_scope(&grant.scope, &request.scope) || !same_scope(&grant.scope, &facts.auth_scope) {
        return Err("SCOPE_MISMATCH");
    }
    if grant.scope.provider != "codex" || grant.scope.mode != "local-app-server" {
        return Err("BLOCKED_UNSUPPORTED_PROVIDER");
    }
    EffectiveCodexPolicy::parse(&grant.approval_policy, &grant.sandbox).map_err(|_| "UNKNOWN_POLICY")?;
    if grant.approval_policy != request.approval_policy || grant.sandbox != request.sandbox { return Err("POLICY_MISMATCH"); }
    if grant.sandbox == "workspace-write" && grant.approval_policy == "\"never\"" { return Err("UNSAFE_POLICY"); }
    if grant.sandbox == "read-only" && request.tools.iter().any(|tool| tool == "write") { return Err("READ_ONLY"); }
    if !matches!(request.action.as_str(), "start" | "resume" | "steer" | "cancel" | "status" | "artifacts")
        || grant.action != request.action || grant.tools.len() > 3 || grant.tools.iter().any(|t| !matches!(t.as_str(), "read" | "write" | "test"))
        || request.tools.iter().any(|t| !matches!(t.as_str(), "read" | "write" | "test") || !grant.tools.contains(t)) {
        return Err("CAPABILITY_MISMATCH");
    }
    if grant.auth_ref != request.auth_ref || grant.auth_ref != facts.auth_ref || !opaque_auth_ref(&grant.auth_ref) || grant.session_ref != request.session_ref || grant.session_ref.as_ref().is_some_and(|s| !id(s)) {
        return Err("AUTH_MISMATCH");
    }
    if request.action != "start" && request.session_ref.is_none() { return Err("SESSION_REQUIRED"); }
    if grant.grant_id != facts.approved_grant_id || grant.nonce != facts.approved_nonce || grant.approval_ref != facts.approval_ref || grant.approval_ref.is_empty() {
        return Err("APPROVAL_REQUIRED");
    }
    if facts.now_ms < grant.starts_at_ms || facts.now_ms >= grant.expires_at_ms || grant.starts_at_ms >= grant.expires_at_ms { return Err("EXPIRED_GRANT"); }
    if facts.spent_nonces.contains(&grant.nonce) { return Err("REPLAYED_GRANT"); }
    let root = path(&grant.workspace_root).ok_or("WORKSPACE_ESCAPE")?;
    let canonical_root = path(&facts.canonical_root).ok_or("WORKSPACE_ESCAPE")?;
    let logical_root = path(&facts.workspace_root).ok_or("WORKSPACE_ESCAPE")?;
    let cwd = path(&request.cwd).ok_or("WORKSPACE_ESCAPE")?;
    let canonical_cwd = path(&facts.canonical_cwd).ok_or("WORKSPACE_ESCAPE")?;
    let within = |p: &str| p == root.as_str() || p.starts_with(&(root.clone() + "/"));
    if root != canonical_root || root != logical_root || !within(&cwd) || !within(&canonical_cwd) { return Err("WORKSPACE_ESCAPE"); }
    if cwd != canonical_cwd { return Err("PATH_ALIAS"); }
    let remaining = facts.remaining_units.ok_or("UNKNOWN_BUDGET")?;
    if grant.scope.project_id != facts.reservation_project_id || grant.reservation_id != facts.reservation_id || grant.budget_units == 0 || grant.budget_units > 9_007_199_254_740_991 || remaining > 9_007_199_254_740_991 || grant.budget_units > remaining || request.cost_units > grant.budget_units { return Err("BUDGET_EXCEEDED"); }
    Ok("ELIGIBLE_OFFLINE_NOT_EXECUTABLE")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn policy_never_falls_back_or_expands_sandbox() {
        for bad in ["bad", "null", "{}", "\"bypass\"", "{\"granular\":{\"unknown\":true}}"] { assert!(EffectiveCodexPolicy::parse(bad, "workspace-write").is_err()); }
        assert!(EffectiveCodexPolicy::parse("\"never\"", "danger-full-access").is_err());
        for mode in ["\"on-request\"", "\"never\"", "{\"granular\":{\"sandbox_approval\":true}}"] {
            let policy = EffectiveCodexPolicy::parse(mode, "read-only").unwrap();
            for turn in ["first", "resume", "follow-up", "inbox"] { let params=policy.turn_params("C:/Alice", "thread", turn); assert_eq!(params["approvalPolicy"], policy.approval()); assert_eq!(params["sandboxPolicy"]["type"], "readOnly"); }
        }
    }
    #[test]
    fn claude_and_unknown_provider_are_blocked() {
        for sandbox in ["read-only", "workspace-write"] { assert!(structured_worker_policy("claude", "\"on-request\"", sandbox).is_err()); }
        assert!(structured_worker_policy("unknown", "\"on-request\"", "read-only").is_err());
    }
    #[test]
    fn offline_paths_reject_traversal_and_aliases() {
        for bad in ["C:/Alice/../Other", "C:/Alice/.", "C:/Alice/NUL", "\\\\server\\share", "C:/Alice/branch."] { assert!(path(bad).is_none()); }
        assert_eq!(path("C:\\Alice\\Project"), Some("c:/alice/project".into()));
    }

    fn fixture() -> (OfflineGrant, OfflineRequest, OfflineFacts) {
        let scope = Scope { project_id: "projectA".into(), graph_revision: 4, node_id: "codexNode".into(), run_id: "run1".into(), attempt_id: "attempt1".into(), provider: "codex".into(), mode: "local-app-server".into() };
        let grant = OfflineGrant { scope: scope.clone(), grant_id: "grant1".into(), action: "start".into(), tools: vec!["read".into()], approval_policy: "\"on-request\"".into(), sandbox: "workspace-write".into(), workspace_root: "C:/Alice/ProjectA".into(), auth_ref: "authref:account1".into(), session_ref: None, starts_at_ms: 1000, expires_at_ms: 3000, nonce: "nonce1".into(), approval_ref: "approval1".into(), reservation_id: "reserve1".into(), budget_units: 10 };
        let request = OfflineRequest { scope: scope.clone(), action: "start".into(), tools: vec!["read".into()], approval_policy: "\"on-request\"".into(), sandbox: "workspace-write".into(), auth_ref: "authref:account1".into(), session_ref: None, cwd: "C:/Alice/ProjectA/src".into(), cost_units: 5 };
        let facts = OfflineFacts { now_ms: 2000, workspace_root: "C:/Alice/ProjectA".into(), canonical_root: "C:/Alice/ProjectA".into(), canonical_cwd: "C:/Alice/ProjectA/src".into(), auth_scope: scope, auth_ref: "authref:account1".into(), approved_grant_id: "grant1".into(), approved_nonce: "nonce1".into(), approval_ref: "approval1".into(), reservation_id: "reserve1".into(), reservation_project_id: "projectA".into(), remaining_units: Some(10), spent_nonces: vec![] };
        (grant, request, facts)
    }

    #[test]
    fn grants_are_offline_and_missing_or_replayed_authority_is_denied() {
        let (grant, request, mut facts) = fixture();
        assert_eq!(evaluate_offline(None, &request, &facts), Err("NO_GRANT"));
        assert_eq!(evaluate_offline(Some(&grant), &request, &facts), Ok("ELIGIBLE_OFFLINE_NOT_EXECUTABLE"));
        facts.spent_nonces.push(grant.nonce.clone());
        assert_eq!(evaluate_offline(Some(&grant), &request, &facts), Err("REPLAYED_GRANT"));
    }

    #[test]
    fn foreign_scope_credentials_revision_and_session_are_denied() {
        for field in ["project", "node", "run", "attempt", "revision", "auth", "session"] {
            let (grant, mut request, facts) = fixture();
            match field {
                "project" => request.scope.project_id = "projectB".into(),
                "node" => request.scope.node_id = "nodeB".into(),
                "run" => request.scope.run_id = "runB".into(),
                "attempt" => request.scope.attempt_id = "attemptB".into(),
                "revision" => request.scope.graph_revision = 5,
                "auth" => request.auth_ref = "authref:other".into(),
                _ => request.session_ref = Some("sessionB".into()),
            }
            assert!(evaluate_offline(Some(&grant), &request, &facts).is_err());
        }
    }

    #[test]
    fn path_budget_expiry_and_approval_fail_closed() {
        for case in ["traversal", "symlink", "alias", "unknownBudget", "cost", "reservation", "expiry", "approval"] {
            let (grant, mut request, mut facts) = fixture();
            match case {
                "traversal" => request.cwd = "C:/Alice/ProjectA/../Other".into(),
                "symlink" => facts.canonical_cwd = "C:/Other".into(),
                "alias" => facts.canonical_cwd = "C:/Alice/ProjectA/other".into(),
                "unknownBudget" => facts.remaining_units = None,
                "cost" => request.cost_units = 11,
                "reservation" => facts.reservation_project_id = "projectB".into(),
                "expiry" => facts.now_ms = grant.expires_at_ms,
                _ => facts.approval_ref = "unapproved".into(),
            }
            assert!(evaluate_offline(Some(&grant), &request, &facts).is_err());
        }
    }

    #[test]
    fn resume_and_cancel_require_a_matching_new_grant() {
        for action in ["resume", "cancel", "steer"] {
            let (mut grant, mut request, mut facts) = fixture();
            request.action = action.into(); request.session_ref = Some("session1".into());
            assert!(evaluate_offline(Some(&grant), &request, &facts).is_err());
            grant.action = action.into(); grant.session_ref = request.session_ref.clone();
            assert!(evaluate_offline(Some(&grant), &request, &facts).is_ok());
            facts.spent_nonces.push(grant.nonce.clone());
            assert!(evaluate_offline(Some(&grant), &request, &facts).is_err());
        }
    }

    #[test]
    fn bypass_and_raw_credential_fields_are_never_grants() {
        let (grant, request, facts) = fixture();
        let mut serialized = serde_json::to_value(&grant).unwrap();
        serialized["apiKey"] = json!("dummy");
        assert!(serde_json::from_value::<OfflineGrant>(serialized).is_err());
        let mut unknown = request.clone(); unknown.tools = vec!["shell".into()];
        assert!(evaluate_offline(Some(&grant), &unknown, &facts).is_err());
        unknown = request.clone(); unknown.sandbox = "danger-full-access".into();
        assert!(evaluate_offline(Some(&grant), &unknown, &facts).is_err());
    }
}
