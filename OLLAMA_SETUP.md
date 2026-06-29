# Ollama Integration with Remix IDE

This guide explains how to set up and use Ollama with Remix IDE for local AI-powered code completion and assistance. Note the restrictions listed below.

## Table of Contents
- [What is Ollama?](#what-is-ollama)
- [Installation](#installation)
- [CORS Configuration](#cors-configuration)
- [Model Download and Management](#model-download-and-management)
- [Recommended Models](#recommended-models)
- [Using Ollama in Remix IDE](#using-ollama-in-remix-ide)
- [Troubleshooting](#troubleshooting)
- [Advanced Configuration](#advanced-configuration)

## What is Ollama?

Ollama is a local AI model runner that allows you to run large language models on your own machine. With Remix IDE's Ollama integration, you get:

- **Privacy**: All processing happens locally on your machine
- **No API rate throttling**: No usage fees or rate limits
- **Offline capability**: Works without internet connection
- **Code-optimized models**: Specialized models for coding tasks
- **Fill-in-Middle (FIM) support**: Advanced code completion capabilities

## Model compatible with the Remix IDE
The following is a list of models compatible with the Remix IDE (both desktop and web). The models have been tested to provide acceptable results on mid-tier consumer GPUs. As operating Ollama independently, the user should understand the model performance criteria and their hardware specifications.

- **codestral:latest**
- **qwen3-coder:latest**
- **gpt-oss:latest**
- **deepseek-coder-v2:latest** Great for code completion

## Restrictions
The current integration does not allow agentic workflows. We strongly recommend running Ollama with hardware acceleration (e.g. GPUs) for best experience. The following features are not enabled when using Ollama, please fallback to remote providers.
- **Contract generation**
- **Workspace Edits**

## Installation

### Step 1: Install Ollama

**macOS:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

**Windows:**
Download the installer from [ollama.ai](https://ollama.ai/download/windows)

**Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

### Step 2: Start Ollama Service

After installation, start the Ollama service:

```bash
ollama serve
```

The service will run on `http://localhost:11434` by default.

## CORS Configuration

To allow Remix IDE to communicate with Ollama, you need to configure CORS settings.
See [Ollama Cors Settings](https://objectgraph.com/blog/ollama-cors/).
## Model Download and Management

### Downloading Models

Use the `ollama pull` command to download models:

```bash
# Download a specific model
ollama pull qwen2.5-coder:14b

# Download the latest version
ollama pull codestral:latest


```

### Managing Models

```bash
# List installed models
ollama list

# Remove a model
ollama rm model-name

# Show model information
ollama show codestral:latest <--template>

# Update a model
ollama pull codestral:latest
```

### Model Storage Locations

Models are stored locally in:
- **macOS:** `~/.ollama/models`
- **Linux:** `~/.ollama/models`
- **Windows:** `%USERPROFILE%\.ollama\models`

## Recommended Models

### For Code Completion (Fill-in-Middle Support)

These models support advanced code completion with context awareness, code explanation, debugging help, and general questions:

#### **Codestral (Excellent for Code)**
```bash
ollama pull codestral:latest    # ~22GB, state-of-the-art code model
```

#### **Quen Coder**
```bash
ollama pull qwen3-coder:latest
```

#### **GPT-OSS**
```bash
ollama pull gpt-oss:latest
```

#### **Code Gemma**
```bash
ollama pull codegemma:7b        # ~5GB, Google's code model
ollama pull codegemma:2b        # ~2GB, lightweight option
```

### Model Size and Performance Guide

| Model Size | RAM Required | Speed | Quality | Use Case |
|------------|--------------|-------|---------|----------|
| 2B-3B      | 4GB+         | Fast  | Good    | Quick completions, low-end hardware |
| 7B-8B      | 8GB+         | Medium| High    | **Recommended for most users** |
| 13B-15B    | 16GB+        | Slower| Higher  | Development workstations |
| 30B+       | 32GB+        | Slow  | Highest | High-end workstations only |

## Using Ollama in Remix IDE

### Step 1: Verify Ollama is Running

Ensure Ollama is running and accessible:
```bash
curl http://localhost:11434/api/tags
```

### Step 2: Select Ollama in Remix IDE

1. Open Remix IDE
2. Navigate to the AI Assistant panel
3. Click the provider selector (shows current provider like "MistralAI")
4. Select "Ollama" from the dropdown
5. Wait for the connection to establish

### Step 3: Choose Your Model

1. After selecting Ollama, a model dropdown will appear
2. Select your preferred model from the list
3. The selection will be saved for future sessions

### Step 4: Start Using AI Features

- **Code Completion**: Type code and get intelligent completions
- **Code Explanation**: Ask questions about your code
- **Error Help**: Get assistance with debugging
- **Code Generation**: Generate code from natural language descriptions

## Troubleshooting

### Common Issues

#### **"Ollama is not available" Error**

1. Check if Ollama is running:
   ```bash
   curl http://localhost:11434/api/tags
   ```

2. Verify CORS configuration:
   ```bash
   curl -H "Origin: https://remix.ethereum.org" http://localhost:11434/api/tags
   ```

3. Check if models are installed:
   ```bash
   ollama list
   ```

#### **No Models Available**

Download at least one model:
```bash
ollama pull codestral:latest
```

#### **Connection Refused**

1. Start Ollama service:
   ```bash
   ollama serve
   ```

2. Check if running on correct port:
   ```bash
   netstat -an | grep 11434
   ```

#### **Model Loading Slow**

- Close other applications to free up RAM
- Use smaller models (7B instead of 13B+)
- Ensure sufficient disk space

#### **CORS Errors in Browser Console**

1. Verify `OLLAMA_ORIGINS` is set correctly
2. Restart Ollama after changing CORS settings
3. Clear browser cache and reload Remix IDE

### Performance Optimization

#### **Hardware Recommendations**

- **Minimum**: 8GB RAM, integrated GPU
- **Recommended**: 16GB RAM, dedicated GPU with 8GB+ VRAM
- **Optimal**: 32GB RAM, RTX 4090 or similar


## Getting Help

- **Ollama Documentation**: [https://ollama.ai/docs](https://ollama.ai/docs)
- **Remix IDE Documentation**: [https://remix-ide.readthedocs.io](https://remix-ide.readthedocs.io)
- **Community Support**: Remix IDE Discord/GitHub Issues
- **Model Hub**: [https://ollama.ai/library](https://ollama.ai/library)

---

**Note**: This integration provides local AI capabilities for enhanced privacy and performance. Model quality and speed depend on your hardware specifications and chosen models.