use serde::Deserialize;
use std::collections::HashMap;

/// Top-level plugin manifest (parsed from manifest.yaml)
#[derive(Debug, Clone, Deserialize)]
pub struct PluginManifest {
    /// "instance-provider" | "agent-app" | "ai-provider"
    #[serde(rename = "type")]
    pub plugin_type: String,
    pub id: String,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub homepage: String,

    #[serde(default)]
    pub requirements: PluginRequirements,
    #[serde(default)]
    pub capabilities: PluginCapabilities,
    #[serde(default)]
    pub scripts: HashMap<String, String>,

    // Agent app specific
    #[serde(default)]
    pub platforms: Vec<PlatformSpec>,
    #[serde(default)]
    pub config: Option<FilePathSpec>,
    #[serde(default)]
    pub auth: Option<FilePathSpec>,
    #[serde(default)]
    pub views: HashMap<String, ViewSpec>,
    #[serde(default)]
    pub requires_auth: Vec<String>,
    #[serde(default)]
    pub provisioning: Option<ProvisioningSpec>,

    // AI provider specific
    #[serde(default, rename = "auth_config")]
    pub auth_config: Option<AuthConfig>,
    #[serde(default)]
    pub models: Vec<ModelSpec>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct PluginRequirements {
    #[serde(default)]
    pub binaries: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct PluginCapabilities {
    #[serde(default)]
    pub mount: bool,
    #[serde(default)]
    pub transfer: bool,
    #[serde(default)]
    pub shell: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PlatformSpec {
    pub os: String,
    #[serde(default)]
    pub arch: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct FilePathSpec {
    pub path: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ViewSpec {
    #[serde(default)]
    pub name: Option<String>,
    pub port: u16,
    #[serde(default = "default_path")]
    pub path: String,
}

fn default_path() -> String {
    "/".to_string()
}

#[derive(Debug, Clone, Deserialize)]
pub struct ProvisioningSpec {
    pub check: String,
    pub log: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AuthConfig {
    pub method: String, // "api_key" | "oauth2_pkce" | "none"
    #[serde(default)]
    pub auth_url: Option<String>,
    #[serde(default)]
    pub token_url: Option<String>,
    #[serde(default)]
    pub client_id: Option<String>,
    #[serde(default)]
    pub redirect_uri: Option<String>,
    #[serde(default)]
    pub scopes: Vec<String>,
    #[serde(default)]
    pub pkce: bool,
    #[serde(default)]
    pub label: Option<String>,
    #[serde(default)]
    pub placeholder: Option<String>,
    #[serde(default)]
    pub docs_url: Option<String>,
    #[serde(default)]
    pub env_var: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModelSpec {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub context_window: Option<u64>,
    #[serde(default)]
    pub supports_tools: bool,
}
