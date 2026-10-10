//! Optional Alice connectors; no terminal, project schema or credential store changes.
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct N8nRequest {
    base_url: String,
    path: String,
    event: Option<serde_json::Value>,
    timeout_ms: Option<u64>,
}
#[derive(Serialize)]
pub struct HttpResult {
    ok: bool,
    status: Option<u16>,
    error: Option<&'static str>,
    attempts: u8,
}
fn failure(error: &'static str) -> HttpResult {
    HttpResult { ok: false, status: None, error: Some(error), attempts: 1 }
}
fn valid_path(path: &str) -> bool {
    if path == "healthz" || path == "healthz/readiness" { return true; }
    let tail = path.strip_prefix("webhook/").or_else(|| path.strip_prefix("webhook-test/"));
    tail.is_some_and(|s| !s.is_empty() && s.len() <= 160 && s.bytes().all(|b| b.is_ascii_alphanumeric() || b"_/-".contains(&b)))
}
fn valid_event(value: &serde_json::Value) -> bool {
    let Some(obj) = value.as_object() else { return false; };
    let allowed = ["schema_version", "project_id", "account_id", "agent_id", "session_id", "action", "timestamp", "correlation_id", "canonical_task", "canonical_task_ref"];
    if obj.keys().any(|key| !allowed.contains(&key.as_str())) || value["schema_version"] != 2 { return false; }
    for key in ["project_id", "account_id", "agent_id", "timestamp", "correlation_id"] {
        if !value[key].as_str().is_some_and(|s| !s.is_empty() && s.len() <= 200) { return false; }
    }
    if !value["session_id"].is_null() && !value["session_id"].is_string() { return false; }
    if let Some(reference) = value.get("canonical_task_ref") {
        let Some(reference) = reference.as_str() else { return false; };
        let Ok(url) = reqwest::Url::parse(reference) else { return false; };
        if url.scheme() != "https" || url.host_str() != Some("github.com") || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() { return false; }
    }
    match value["action"].as_str() {
        Some("connection.test") => value.get("canonical_task").is_none(),
        _ => false,
    }
}
#[tauri::command]
pub async fn alice_n8n_request(request: N8nRequest) -> HttpResult {
    let Ok(mut url) = reqwest::Url::parse(&request.base_url) else { return failure("invalid-config"); };
    if !["http", "https"].contains(&url.scheme()) || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() || !valid_path(&request.path) { return failure("invalid-config"); }
    if request.event.as_ref().is_some_and(|v| !valid_event(v)) { return failure("invalid-config"); }
    url.set_path(&format!("{}/{}", url.path().trim_end_matches('/'), request.path));
    let Ok(client) = reqwest::Client::builder().timeout(Duration::from_millis(request.timeout_ms.unwrap_or(5000).clamp(100,10000))).redirect(reqwest::redirect::Policy::none()).build() else { return failure("offline"); };
    let builder = if let Some(event) = request.event { client.post(url).json(&event) } else { client.get(url) };
    match builder.send().await {
        Ok(response) => { let status=response.status(); HttpResult {ok:status.is_success(),status:Some(status.as_u16()),error:if status.is_success(){None}else{Some("http")},attempts:1} },
        Err(error) => failure(if error.is_timeout(){"timeout"}else{"offline"}),
    }
}

#[tauri::command]
pub async fn alice_github_read(repository: String, reference: String, path: String) -> Result<String,String> {
    // The adapter is deliberately limited to the first governed project and read-only APIs.
    if repository != "klar690-cmd/RumoAoMilhao" || !(reference == "main" || reference == "assistente/source-art-active" || (reference.len()==40 && reference.bytes().all(|b| b.is_ascii_hexdigit()))) { return Err("alice.canonicalMismatch".into()); }
    let endpoint = if path.is_empty() { format!("repos/{repository}/commits/{reference}") } else {
        let allowed = path=="docs/coordination/CONTROL.md" || path=="docs/coordination/ASSISTENTE.md" || path=="docs/coordination/results/ASSISTENTE_LATEST.md" || (path.starts_with("docs/coordination/PHASE_ASSISTENTE_") && path.ends_with(".md") && path.bytes().all(|b| b.is_ascii_alphanumeric() || b"_/.-".contains(&b)) && !path.contains(".."));
        if !allowed { return Err("alice.canonicalMismatch".into()); }
        format!("repos/{repository}/contents/{path}?ref={reference}")
    };
    let mut standard = std::process::Command::new("gh");
    crate::git_control::hide_console(&mut standard);
    let mut command = tokio::process::Command::from(standard);
    command.args(["api", &endpoint]);
    if path.is_empty() { command.args(["--jq", ".sha"]); } else { command.args(["-H","Accept: application/vnd.github.raw+json"]); }
    command.kill_on_drop(true);
    let output=tokio::time::timeout(Duration::from_secs(20),command.output()).await.map_err(|_|"alice.canonicalUnavailable")?.map_err(|_|"alice.canonicalUnavailable")?;
    if !output.status.success() || output.stdout.len()>1_000_000 { return Err("alice.canonicalUnavailable".into()); }
    String::from_utf8(output.stdout).map(|s|s.trim().to_string()).map_err(|_|"alice.canonicalUnavailable".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn rejects_paths_and_secret_payloads() {
        assert!(valid_path("webhook/alice")); assert!(!valid_path("webhook/../credentials"));
        assert!(!valid_path("api/v1/credentials"));
        assert!(!valid_event(&serde_json::json!({"schema_version":2,"password":"x"})));
    }
}
