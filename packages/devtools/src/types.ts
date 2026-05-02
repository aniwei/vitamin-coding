export interface DevtoolsPanelContribution {
  name: string
  title: string
  path?: string
}

export interface DevtoolsProviderContribution {
  name: string
  kind: 'diagnostics' | 'timeline'
  description?: string
}

export interface DevtoolsActionContribution {
  name: string
  title: string
  description?: string
}

export interface DevtoolsPluginContribution {
  panels?: DevtoolsPanelContribution[]
  providers?: DevtoolsProviderContribution[]
  actions?: DevtoolsActionContribution[]
}

export interface RegisteredDevtoolsPluginContribution {
  pluginId: string
  contribution: DevtoolsPluginContribution
}
