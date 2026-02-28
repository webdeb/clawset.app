import { useState } from "react";
import { Card, Button, Input, Chip, Spinner } from "@heroui/react";
import { useClawset, AuthProviderInfo } from "../context/ClawsetContext";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Generic auth management page.
 * Renders api_key inputs or OAuth2 login buttons based on AI provider manifests.
 */
export function AuthContent() {
  const { authProviders, authStatus, saveApiKey, startOAuthFlow, completeOAuthFlow } = useClawset();

  if (authProviders.length === 0) {
    return (
      <div className="w-full min-h-full flex flex-col items-center justify-center bg-background text-foreground p-8">
        <Card className="p-6 w-full max-w-md flex flex-col items-center gap-4">
          <h2 className="text-xl font-bold">Authentication</h2>
          <p className="text-default-500 text-sm text-center">
            No AI provider plugins installed. Add one from the Plugins tab.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full min-h-full flex flex-col items-center bg-background text-foreground p-8">
      <Card className="p-6 w-full max-w-2xl flex flex-col gap-6">
        <div>
          <h2 className="text-2xl font-bold">Authentication</h2>
          <p className="text-default-500 text-sm">
            Manage credentials for your AI providers. These are shared across all agent apps.
          </p>
        </div>

        {authProviders.map((provider) => (
          <AuthProviderCard
            key={provider.id}
            provider={provider}
            isAuthenticated={!!authStatus[provider.id]}
            onSaveApiKey={(key) => saveApiKey(provider.id, key)}
            onStartOAuth={() => startOAuthFlow(provider.id)}
            onCompleteOAuth={(redirectUrl) => completeOAuthFlow(provider.id, redirectUrl)}
          />
        ))}
      </Card>
    </div>
  );
}

function AuthProviderCard({
  provider,
  isAuthenticated,
  onSaveApiKey,
  onStartOAuth,
  onCompleteOAuth,
}: {
  provider: AuthProviderInfo;
  isAuthenticated: boolean;
  onSaveApiKey: (key: string) => Promise<void>;
  onStartOAuth: () => Promise<string>;
  onCompleteOAuth: (redirectUrl: string) => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [showRedirectInput, setShowRedirectInput] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState("");
  const [error, setError] = useState("");

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) return;
    setLoading(true);
    setError("");
    try {
      await onSaveApiKey(apiKey.trim());
      setApiKey("");
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleStartOAuth = async () => {
    setLoading(true);
    setError("");
    try {
      const authUrl = await onStartOAuth();
      await openUrl(authUrl);
      setShowRedirectInput(true);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteOAuth = async () => {
    if (!redirectUrl.trim()) return;
    setLoading(true);
    setError("");
    try {
      await onCompleteOAuth(redirectUrl.trim());
      setShowRedirectInput(false);
      setRedirectUrl("");
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-default-50 border border-default-200 rounded-lg">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-semibold">{provider.name}</span>
          <Chip size="sm" color={isAuthenticated ? "success" : "default"} variant="soft" className="text-[10px] h-5">
            {isAuthenticated ? "Connected" : "Not Connected"}
          </Chip>
        </div>
        <span className="text-[10px] text-default-400 uppercase tracking-wider font-semibold">
          {provider.method === "api_key" ? "API Key" : "OAuth"}
        </span>
      </div>

      {provider.description && (
        <p className="text-xs text-default-500">{provider.description}</p>
      )}

      {!isAuthenticated && provider.method === "api_key" && (
        <div className="flex gap-2 items-end">
          <div className="flex-1 flex flex-col gap-1">
            <Input
              type="password"
              placeholder={provider.placeholder || "Enter API key..."}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={loading}
              className="bg-default-100 rounded-lg text-sm"
            />
            {provider.docsUrl && (
              <a href={provider.docsUrl} target="_blank" rel="noopener" className="text-[10px] text-primary hover:underline">
                Get your API key →
              </a>
            )}
          </div>
          <Button
            className="bg-primary text-white h-[40px]"
            onPress={handleSaveApiKey}
            isDisabled={loading || !apiKey.trim()}
          >
            {loading && <Spinner size="sm" color="current" />}
            Save
          </Button>
        </div>
      )}

      {!isAuthenticated && provider.method === "oauth2_pkce" && !showRedirectInput && (
        <div className="flex flex-col gap-2">
          <Button
            className="w-full bg-black text-white"
            size="lg"
            onPress={handleStartOAuth}
            isDisabled={loading}
          >
            {loading && <Spinner size="sm" color="current" />}
            Login with {provider.name}
          </Button>
          <p className="text-[10px] text-default-400 text-center uppercase tracking-wide">
            Opens your browser for authentication
          </p>
        </div>
      )}

      {!isAuthenticated && provider.method === "oauth2_pkce" && showRedirectInput && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-default-600 font-medium">
            After completing the browser login, copy the redirect URL and paste it below.
          </p>
          <Input
            type="text"
            placeholder="http://localhost:1455/auth/callback?code=..."
            value={redirectUrl}
            onChange={(e) => setRedirectUrl(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              className="flex-1 bg-primary text-white"
              onPress={handleCompleteOAuth}
              isDisabled={loading || !redirectUrl.trim()}
            >
              {loading && <Spinner size="sm" color="current" />}
              Submit
            </Button>
            <Button
              variant="ghost"
              className="text-default-500"
              onPress={() => setShowRedirectInput(false)}
              isDisabled={loading}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {isAuthenticated && (
        <p className="text-xs text-success font-medium">✓ Credentials stored</p>
      )}

      {error && (
        <div className="bg-danger/10 text-danger text-xs p-2 rounded border border-danger/20">
          {error}
        </div>
      )}
    </div>
  );
}
