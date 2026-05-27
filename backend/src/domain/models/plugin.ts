export type PluginState =
  | "discovered"
  | "loading"
  | "setting_up"
  | "active"
  | "errored"
  | "tearing_down"
  | "disabled";

export interface PluginNav {
  readonly label: string;
  readonly screen?: string;
  readonly section?: string;
}

export interface PluginSettings {
  readonly html?: string;
  readonly server_files?: readonly string[];
}

export interface PluginDiagnostics {
  readonly server_files?: readonly string[];
  readonly callable?: string;
}

export interface PluginManifest {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly private?: boolean;
  readonly bundled?: boolean;
  readonly type?: string;
  readonly nav?: PluginNav;
  readonly screen?: string;
  readonly server?: string;
  readonly script?: string;
  readonly component?: string;
  readonly routes?: string;
  readonly hooks?: readonly { event: string; phase?: "before" | "after" }[];
  readonly providers?: readonly { type: string; name: string; factory: string }[];
  readonly dependsOn?: readonly string[];
  readonly tour?: string | { file: string };
  readonly settings?: PluginSettings;
  readonly diagnostics?: PluginDiagnostics;
}

export interface PluginCapabilities {
  readonly hasScreen: boolean;
  readonly hasScript: boolean;
  readonly hasSettings: boolean;
  readonly hasTour: boolean;
  readonly hasComponent: boolean;
}

export interface LoadedPlugin {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly bundled: boolean;
  readonly dir: string;
  readonly manifest: PluginManifest;
  readonly capabilities: PluginCapabilities;
}

export interface PluginStatus {
  readonly id: string;
  readonly name: string;
  readonly version?: string;
  readonly state: PluginState;
  readonly error?: string;
}
