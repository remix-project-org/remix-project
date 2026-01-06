import lunr from 'lunr';
import { extractImportsFromFile } from "../helpers/localImportsExtractor";

interface Document {
  id: number;
  filename: string;
  content: string;
  identifier: number;
}

interface indexT{
  isIndexed: boolean;
  lastIndexedTime?: number;
  reason?: string;
}

enum SupportedFileExtensions {
  solidity = '.sol',
  vyper = '.vy',
  circom = '.circom',
  javascript = '.js',
  typescript = '.ts',
  tests_ts = '.test.ts',
  tests_js = '.test.js',
}

export class CodeCompletionAgent {
  props: any;
  indexer: any;
  Documents: Document[] = [];
  INDEX_THRESHOLD = 0.05;
  N_MATCHES = 1;
  indexed: indexT = {
    isIndexed: false,
    lastIndexedTime: 0,
    reason: 'Init',
  };

  constructor(props) {
    this.props = props;
    this.listenForChanges();
    this.indexer =lunr(function () {
      this.ref('id')
      this.field('filename')
      this.field('content')
      this.field('Identifier');
    });

    setInterval(() => {
      this.indexWorkspace()
    }, 60000)
  }

  listenForChanges() {
    this.props.on('remixAI', 'fileAdded', (path) => { this.indexed = { isIndexed: false, reason:"fileAdded" } });
    this.props.on('remixAI', 'fileRemoved', (path) => { this.indexed = { isIndexed: false, reason:"fileRemoved" } });
    this.props.on('remixAI', 'workspaceCreated', () => { this.indexed = { isIndexed: false, reason:"workspaceCreated" } });
    this.props.on('remixAI', 'workspaceRenamed', () => { this.indexed = { isIndexed: false, reason:"workspaceRenamed" }});
    this.props.on('remixAI', 'workspaceDeleted', () => { this.indexed = { isIndexed: false, reason:"workspaceDeleted" } });
  }

  async getDcocuments() {
    try {
      const documents: Document[] = [];
      const jsonDirsContracts = await this.props.call('fileManager', 'copyFolderToJson', '/').then((res) => res.contracts);
      let c = 0;
      for (const file in jsonDirsContracts.children) {
        if (!Object.values(SupportedFileExtensions).some(ext => file.endsWith(ext))) continue;
        documents.push({
          id: ++c,
          filename: file,
          content: jsonDirsContracts.children[file].content,
          identifier: c - 1,
        });
      }
      return documents;
    } catch (error) {
      return [];
    }
  }

  async getLocalImports(fileContent: string, currentFile: string) {
    try {
      // Use extractImportsFromFile to get all imports from the current file
      const imports = extractImportsFromFile(fileContent);
      const localImports = imports.filter(imp => imp.isLocal);
      return localImports.map(imp => imp.importPath);
    } catch (error) {
      return [];
    }
  }

  indexWorkspace() {
    this.getDcocuments().then((documents) => {
      this.indexer =lunr(function () {
        this.ref('id')
        this.field('filename')
        this.field('content')
        this.field('Identifier');

        documents.forEach(doc => {
          this.add(doc);
        });
      });
      this.Documents = documents;
    });

    this.indexed = { isIndexed: true, lastIndexedTime: Date.now(), reason: 'init Indexing' };
  }

  async getContextFiles(prompt) {
    try {
      if (!this.indexed.isIndexed) {
        await this.indexWorkspace();
      }

      const currentFile = await this.props.call('fileManager', 'getCurrentFile');
      const content = prompt;
      const searchResult = this.indexer.search(content)
      const fcps = await this.processResults(searchResult, currentFile);
      const resolvedFcps = await Promise.all(fcps);
      return resolvedFcps;
    } catch (error) {
      return [];
    }
  }

  async processResults(results: any, currentFile: string) {

    // remove the current file name from the results list
    const rmResults = await results.filter(result => {
      return this.Documents.find(doc => doc.id === Number(result.ref)).filename !== currentFile;
    });

    // filter out the results which have the same extension as the current file.
    // Do not mix and match file extensions as this will lead to incorrect completions
    const extResults = await rmResults.filter(result => {
      return this.Documents.find(doc => doc.id === Number(result.ref)).filename.split('.').pop() === currentFile.split('.').pop();
    });

    // filter out the results which have a score less than the INDEX_THRESHOLD
    const topResults = await extResults.filter(result => result.score >= this.INDEX_THRESHOLD).slice(0, this.N_MATCHES);

    // get the LATEST content of the top results in case the file has been modified and not indexed yet
    const fileContentPairs = topResults.map(async result => {
      const document = this.Documents.find(doc => doc.id === Number(result.ref));
      const currentContent = await this.props.call('fileManager', 'readFile', document.filename);
      return { file: document.filename, content: currentContent };
    });

    const localImports = await this.getLocalImports(await this.props.call('fileManager', 'readFile', currentFile), currentFile);
    // check if the local import is in fileContentPairs file
    for (const li of localImports) {
      if (fileContentPairs.find(fcp => fcp.file === li)) continue;
      const currentContent = await this.props.call('fileManager', 'readFile', li);
      fileContentPairs.push({ file: li, content: currentContent });
    }
    return fileContentPairs;
  }

}
