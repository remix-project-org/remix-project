import React, { useEffect, useState } from "react";
import { customScriptRunnerConfig, Dependency, ProjectConfiguration } from "../types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faToggleOff, faToggleOn, faTrash } from "@fortawesome/free-solid-svg-icons";
import { CustomTooltip } from "@remix-ui/helper";

export interface ScriptRunnerUIProps {
    publishedConfigurations: ProjectConfiguration[];
    openCustomConfig: () => any;
    saveCustomConfig(content: customScriptRunnerConfig): void;
    activateCustomScriptRunner(config: customScriptRunnerConfig): Promise<string>;
    customConfig: customScriptRunnerConfig;
}

export const CustomScriptRunner = (props: ScriptRunnerUIProps) => {
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [name, setName] = useState<string>('');
  const [alias, setAlias] = useState<string>('');
  const [version, setVersion] = useState<string>('');
  const [baseConfig, setBaseConfig] = useState<string>('default');
  const [loading, setLoading] = useState<boolean>(false);
  const [useRequire, setUseRequire] = useState<boolean>(false)

  const { customConfig } = props;

  useEffect(() => {
    if (!customConfig) return;
    setDependencies(customConfig.dependencies);
    setBaseConfig(customConfig.baseConfiguration);
  },[customConfig])

  const handleAddDependency = () => {
    if (name.trim() && version.trim()) {
      const newDependency: Dependency = { name, version, require: useRequire, alias };
      setDependencies([...dependencies, newDependency]);
      setName('');
      setVersion('');
    } else {
      alert('Please fill out both name and version.');
    }
  };

  const handleRemoveDependency = (index: number) => {
    const updatedDependencies = dependencies.filter((_, i) => i !== index);
    setDependencies(updatedDependencies);
  };

  const handleSaveToFile = () => {
    const fileData = JSON.stringify(dependencies, null, 2);
    console.log(fileData, baseConfig);
    const customConfig: customScriptRunnerConfig = { baseConfiguration: baseConfig, dependencies };
    console.log(customConfig);
    props.saveCustomConfig(customConfig);
  };

  const openConfig = async () => {
    const fileData: customScriptRunnerConfig = await props.openCustomConfig();
  }

  const activateCustomConfig = async () => {
    const customConfig: customScriptRunnerConfig = { baseConfiguration: baseConfig, dependencies };
    setLoading(true);
    try {
      await props.activateCustomScriptRunner(customConfig);
    } catch (e) {
      console.log(e)
    } finally {
      setLoading(false);
    }
  }

  const onSelectBaseConfig = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setBaseConfig(e.target.value);
  }

  const toggleRequire = () => {
    setUseRequire((prev) => !prev)
  }

  if (loading) {
    return <div style={{ padding: '20px', maxWidth: '400px', margin: 'auto' }}>
      <div className="text-center py-5">
        <i className="fas fa-spinner fa-pulse fa-2x"></i>
      </div>
    </div>
  }

  return (
    <div style={{ padding: '20px', maxWidth: '400px', margin: 'auto' }}>
      <h5>Custom configuration</h5>
      <label>Select a base configuration</label>
      <select value={baseConfig} className="form-control" onChange={onSelectBaseConfig} style={{ marginBottom: '10px' }}>
        <option value="none">Select a base configuration</option>
        {props.publishedConfigurations.map((config: ProjectConfiguration, index) => (
          <option key={index} value={config.name}>
            {config.name}
          </option>
        ))}
      </select>
      <label>Add dependencies</label>
      <div style={{ marginBottom: '10px' }}>
        <input
          type="text"
          placeholder="Dependency Name"
          value={name}
          className="form-control"
          onChange={(e) => setName(e.target.value)}
          style={{ marginRight: '10px' }}
        />
        <input
          type="text"
          placeholder="Alias"
          className="form-control mt-1"
          value={alias}
          onChange={(e) => setAlias(e.target.value)} />
        <input
          type="text"
          placeholder="Version"
          className="form-control mt-1"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
        />
        <CustomTooltip
          placement="bottom"
          tooltipText="use require when the module doesn't support import statements"
        >
          <div>
            <label className="pr-2 pt-2">Use 'require':</label>
            <FontAwesomeIcon className={useRequire ? 'text-success' : ''} onClick={toggleRequire} icon={useRequire ? faToggleOn : faToggleOff}></FontAwesomeIcon>
          </div>
        </CustomTooltip>
        <button
          className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors w-full mt-1"
          onClick={handleAddDependency}>
                    Add
        </button>
      </div>
      <ul>
        {dependencies.map((dependency, index) => (
          <li key={index} style={{ marginBottom: '5px' }}>
            <div className="flex items-baseline justify-between">
              {dependency.name} - {dependency.version}
              <button
                onClick={() => handleRemoveDependency(index)}
                className="inline-flex items-center px-4 py-2 bg-danger text-white rounded-md hover:bg-danger/90 transition-colors"
                style={{ marginLeft: '10px' }}
              >
                <FontAwesomeIcon icon={faTrash} />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {dependencies.length > 0 && (
        <button className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors w-full" onClick={handleSaveToFile} style={{ marginTop: '20px' }}>
                    Save config
        </button>
      )}
      <button className="inline-flex items-center px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 transition-colors w-full" onClick={openConfig} style={{ marginTop: '20px' }}>
                Open config
      </button>
      {dependencies.length > 0 && (
        <button className="inline-flex items-center px-4 py-2 bg-success text-white rounded-md hover:bg-success/90 transition-colors w-full" onClick={activateCustomConfig} style={{ marginTop: '20px' }}>
                    Activate
        </button>)}
    </div>
  );
}