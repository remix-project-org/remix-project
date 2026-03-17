import { isOllamaAvailable, listModels, getBestAvailableModel, validateModel, getOllamaHost } from "../inferencers/local/ollama";
import { OllamaInferencer } from "../inferencers/local/ollamaInferencer";
import { GenerationParams } from "../types/models";

type CommandHandler = (args: string, reference: any, statusCallback?: (status: string) => Promise<void>) => void;

export class ChatCommandParser {
  private commands: Map<string, CommandHandler> = new Map();
  private props: any

  constructor(props: any) {
    this.registerDefaultCommands();
    this.props = props;
  }

  private registerDefaultCommands() {
    this.register("@generate", this.handleGenerate);
    this.register("@workspace", this.handleWorkspace);
    this.register("@setAssistant", this.handleAssistant);
    this.register("@ollama", this.handleOllama);
    this.register("/ollama", this.handleOllama);
    this.register("/generate", this.handleGenerate);
    this.register("/g", this.handleGenerate);
    this.register("/workspace", this.handleWorkspace);
    this.register("/w", this.handleWorkspace);
    this.register("/setAssistant", this.handleAssistant);
    // Add more default commands as needed
  }

  public register(command: string, handler: CommandHandler) {
    this.commands.set(command.toLowerCase(), handler);
  }

  public async parse(input: string, statusCallback?: (status: string) => Promise<void>) {
    const commandPattern = /^[@/](\w{1,})\s*(.*)/;
    const match = input.match(commandPattern);

    if (!match) {
      return "";
    }

    const commandName = `/${match[1].toLowerCase()}`;
    const rawArgs = match[2].trim();
    const strippedInput = input.slice(match[0].indexOf(match[2])).trim(); // remove command prefix

    const handler = this.commands.get(commandName);
    if (handler) {
      return handler(rawArgs, this, statusCallback);
    } else {
      return "";
    }
  }

  private async handleGenerate(prompt: string, ref, statusCallback?: (status: string) => Promise<void>) {
    try {
      await statusCallback?.('Initializing new workspace generation...')
      GenerationParams.return_stream_response = false
      GenerationParams.stream_result = false
    	return await ref.props.call('remixAI', 'generate', "generate " + prompt, GenerationParams, "", false, statusCallback);
    } catch (error) {
      return "Generation failed. Please try again.";
    }
  }

  private async handleWorkspace(prompt: string, ref, statusCallback?: (status: string) => Promise<void>) {
    try {
      await statusCallback?.('Initializing new workspace request...')
      GenerationParams.return_stream_response = false
      GenerationParams.stream_result = false
      return await ref.props.call('remixAI', 'generateWorkspace', prompt, GenerationParams, "", false, statusCallback);
    } catch (error) {
      return "Workspace generation failed. Please try again.";
    }
  }

  private async handleAssistant(provider: string, ref) {
    if (provider === 'openai' || provider === 'mistralai' || provider === 'anthropic' || provider === 'ollama') {
      try {
        // Special handling for Ollama - check availability first
        if (provider === 'ollama') {
          const available = await isOllamaAvailable();
          if (!available) {
            // Don't set the provider if Ollama is not available
            return `Failed to set AI Provider to \`${provider}\``; // Return empty string to suppress success message - error will be shown by UI
          }
        }

        await ref.props.call('remixAI', 'setAssistantProvider', provider);
        return "AI Provider set to `" + provider + "` successfully! "
      } catch (error) {
        return `Failed to set AI Provider to \`${provider}\`: ${error.message || error}`
      }
    } else {
      return "Invalid AI Provider. Please use `openai`, `mistralai`, `anthropic`, or `ollama`."
    }
  }

  private async handleOllama(prompt: string, ref: any, statusCallback?: (status: string) => Promise<void>) {
    try {
      if (prompt === "start") {
        const available = await isOllamaAvailable();
        if (!available) {
          return 'Ollama is not available on any of the default ports (11434, 11435, 11436). Please ensure Ollama is running and CORS is enabled: https://objectgraph.com/blog/ollama-cors/';
        }

        const host = getOllamaHost();
        const models = await listModels();
        const bestModel = await getBestAvailableModel();

        let response = `Ollama discovered on ${host}\n\n`;
        response += `Available models (${models.length}):\n`;
        response += models.map((model: any) => `• \`${model}\``).join("\n");

        if (bestModel) {
          response += `\n\nRecommended model: \`${bestModel}\``;
        }

        response += "\n\nCommands:\n";
        response += "• `/ollama select <model>` - Select a specific model\n";
        response += "• `/ollama auto` - Auto-select best available model\n";
        response += "• `/ollama status` - Check current status\n";
        response += "• `/ollama stop` - Stop Ollama integration";

        return response;
      } else if (prompt.trimStart().startsWith("select")) {
        const model = prompt.split(" ")[1];
        if (!model) {
          return "Please provide a model name to select.\nExample: `/ollama select llama2:7b`";
        }

        const available = await isOllamaAvailable();
        if (!available) {
          return 'Ollama is not available. Please ensure it is running and try `/ollama start` first.';
        }

        const isValid = await validateModel(model);
        if (!isValid) {
          const models = await listModels();
          return `Model \`${model}\` is not available.\n\nAvailable models:\n${models.map(m => `• \`${m}\``).join("\n")}`;
        }

        // instantiate ollama with selected model
        ref.props.remoteInferencer = new OllamaInferencer(model);
        ref.props.remoteInferencer.event.on('onInference', () => {
          ref.props.isInferencing = true;
        });
        ref.props.remoteInferencer.event.on('onInferenceDone', () => {
          ref.props.isInferencing = false;
        });

        return `Model set to \`${model}\`. You can now start chatting with it.`;
      } else if (prompt === "auto") {
        const available = await isOllamaAvailable();
        if (!available) {
          return 'Ollama is not available. Please ensure it is running and try `/ollama start` first.';
        }

        const bestModel = await getBestAvailableModel();
        if (!bestModel) {
          return 'No models available. Please install a model first using `ollama pull <model-name>`.';
        }

        ref.props.remoteInferencer = new OllamaInferencer(bestModel);
        ref.props.remoteInferencer.event.on('onInference', () => {
          ref.props.isInferencing = true;
        });
        ref.props.remoteInferencer.event.on('onInferenceDone', () => {
          ref.props.isInferencing = false;
        });

        return `Auto-selected model: \`${bestModel}\`. You can now start chatting with it.`;
      } else if (prompt === "status") {
        const available = await isOllamaAvailable();
        if (!available) {
          return 'Ollama is not available on any of the default ports.';
        }

        const host = getOllamaHost();
        const models = await listModels();
        const currentModel = ref.props.remoteInferencer?.model_name || 'None selected';

        let response = `Ollama Status:\n`;
        response += `• Host: ${host}\n`;
        response += `• Available models: ${models.length}\n`;
        response += `• Current model: \`${currentModel}\`\n`;
        response += `• Integration: ${ref.props.remoteInferencer ? 'Active' : 'Inactive'}`;

        return response;
      } else if (prompt === "stop") {
        if (ref.props.remoteInferencer) {
          ref.props.remoteInferencer = null;
          ref.props.initialize()

          return "Ollama integration stopped. Switched back to remote inference.";
        } else {
          return "ℹOllama integration is not currently active.";
        }
      } else {
        return `Invalid command. Available commands:
• \`/ollama start\` - Initialize and discover Ollama
• \`/ollama select <model>\` - Select a specific model
• \`/ollama auto\` - Auto-select best available model
• \`/ollama status\` - Check current status
• \`/ollama stop\` - Stop Ollama integration`;
      }
    } catch (error) {
      console.error("Ollama command error:", error);
      return `Ollama command failed: ${error.message || 'Unknown error'}. Please try again.`;
    }
  }
}

