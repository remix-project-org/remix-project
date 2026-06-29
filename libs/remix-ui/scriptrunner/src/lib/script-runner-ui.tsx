import React, { useEffect, useState } from "react";
import { customScriptRunnerConfig, ProjectConfiguration } from "../types";
import { CustomScriptRunner } from "./custom-script-runner";
import ConfigSection from "./components/config-section";

export interface ScriptRunnerUIProps {
  loadScriptRunner: (config: ProjectConfiguration) => void;
  openCustomConfig: () => any;
  saveCustomConfig(content: customScriptRunnerConfig): void;
  activateCustomScriptRunner(config: customScriptRunnerConfig): Promise<string>;
  customConfig: customScriptRunnerConfig;
  configurations: ProjectConfiguration[];
  activeConfig: ProjectConfiguration;
  enableCustomScriptRunner: boolean;
}

export const ScriptRunnerUI = (props: ScriptRunnerUIProps) => {
  const { loadScriptRunner, configurations, activeConfig, enableCustomScriptRunner } = props;
  const [activeKey, setActiveKey] = useState('default');

  useEffect(() => {
    if (activeConfig && !activeConfig.errorStatus) {
      setActiveKey(activeConfig.name)
    }
  },[activeConfig])

  if (!configurations) {
    return <div>Loading...</div>
  }

  return (
    <div className="px-5">
      <div className="d-flex flex-column justify-content-between mt-4">
        <div className="text-uppercase mb-2 text-primary h2" style={{ fontSize: 'x-large' }}>script configuration</div>
        <div className="text-secondary h3" style={{ fontSize: 'large' }}>Choose a specific configuration for script execution</div>
      </div>
      <div className="mt-3 d-flex flex-column gap-3 mb-4">
        {configurations.filter((config) => config.publish).map((config: ProjectConfiguration, index) => (
          <ConfigSection
            activeKey={activeKey}
            setActiveKey={setActiveKey}
            config={config}
            key={index}
            loadScriptRunner={loadScriptRunner}
            activeConfig={activeConfig}
          />
        ))}
      </div>
      {enableCustomScriptRunner &&
        <CustomScriptRunner
          customConfig={props.customConfig}
          activateCustomScriptRunner={props.activateCustomScriptRunner}
          saveCustomConfig={props.saveCustomConfig}
          openCustomConfig={props.openCustomConfig}
          publishedConfigurations={configurations.filter((config) => config.publish)}
        />
      }
    </div>
  )
}

