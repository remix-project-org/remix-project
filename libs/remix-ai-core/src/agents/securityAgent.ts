// security checks
import * as fs from 'fs';

interface SecurityReport {
  compiled: boolean;
  vulnerabilities: string[];
  isNotSafe: string;
  fileName: string;
  reportTimestamp: string;
  recommendations: string[];
  fileModifiedSinceLastReport: boolean;
  hasPastedCode: boolean;
}

class WorkspaceWatcher {
  private intervalId: NodeJS.Timeout | null = null;
  public interval: number;
  private task: () => void;

  constructor(task: () => void, interval: number) {
    this.task = task;
    this.interval = interval;
  }

  start(): void {
    if (this.intervalId === null) {
      this.intervalId = setInterval(() => {
        this.task();
      }, this.interval);
    }
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }
}

export class SecurityAgent {
  public currentFile: string;
  public openedFiles: any;
  private basePlugin: any;
  private watcher: WorkspaceWatcher;
  public reports: SecurityReport[] = [];

  constructor(plugin) {
    this.basePlugin = plugin;

    this.basePlugin.on('remixAI', 'fileRemoved', (path) => { this.removeFileFromReport(path) });
    this.basePlugin.on('remixAI', 'fileRenamed', (oldName, newName) => {
      this.removeFileFromReport(oldName);
      this.addFileToReport(newName);
    });

    // disable for now the compilationFinished event
    // this.basePlugin.on('solidity', 'compilationFinished', async (fileName, source, languageVersion, data) => { this.onCompilationFinished(fileName) });
    // this.basePlugin.on('vyper', 'compilationFinished', async (fileName, source, languageVersion, data) => { this.onCompilationFinished(fileName) });
    // this.basePlugin.on('hardhat', 'compilationFinished', async (fileName, source, languageVersion, data) => { this.onCompilationFinished(fileName) });
    // this.basePlugin.on('foundry', 'compilationFinished', async (fileName, source, languageVersion, data) => { this.onCompilationFinished(fileName) });

    this.watcher = new WorkspaceWatcher(async () => {
      try {
        this.currentFile = await this.basePlugin.call('fileManager', 'getCurrentFile');
        this.openedFiles = await this.basePlugin.call('fileManager', 'getOpenedFiles');

        Object.keys(this.openedFiles).forEach(key => {
          this.addFileToReport(this.openedFiles[key]);
        });
      } catch (error) {
        // no file selected or opened currently
      }
    }, 10000);
    this.watcher.start();
  }

  addFileToReport(file: string): void {
    const report = this.reports.find((r) => r.fileName === file);
    if (report) {
      // nothing to do
    } else {
      this.reports.push({
        compiled: false,
        isNotSafe: 'No',
        vulnerabilities: [],
        fileName: file,
        reportTimestamp: null,
        recommendations: [],
        fileModifiedSinceLastReport: false,
        hasPastedCode: false
      });
    }

  }

  async onCompilationFinished(file: string) {
    let report = this.reports.find((r) => r.fileName === file);
    if (report) {
      report.compiled = true;
      report.fileModifiedSinceLastReport = false;
    } else {
      report = {
        compiled: true,
        isNotSafe: 'No',
        vulnerabilities: [],
        fileName: file,
        reportTimestamp: null,
        recommendations: [],
        fileModifiedSinceLastReport: false,
        hasPastedCode: false
      }
      this.reports.push(report);
    }

    try {
      this.processFile(file);
      console.log('Checking for vulnerabilities after compilation', this.reports);
    } catch (error) {
      console.error('Error checking for vulnerabilities after compilation: ', error);
    }

    // check for security vulnerabilities
  }

  removeFileFromReport(file: string): void {
    const index = this.reports.findIndex((r) => r.fileName === file);
    if (index !== -1) {
      this.reports.splice(index, 1);
    }
  }

  modifiedFile(file: string): void {
    const report = this.reports.find((r) => r.fileName === file);
    if (report) {
      report.fileModifiedSinceLastReport = true;
    }
  }

  async processFile(file: string) {
    try {
      const report = this.reports.find((r) => r.fileName === file);
      if (report) { }
      else {
        this.reports.push({
          compiled: false,
          isNotSafe: 'No',
          vulnerabilities: [],
          fileName: file,
          reportTimestamp: null,
          recommendations: [],
          fileModifiedSinceLastReport: false,
          hasPastedCode: false
        });
      }

      if (!report.reportTimestamp || report.fileModifiedSinceLastReport) {
        const content = await this.basePlugin.call('fileManager', 'getFile', file);
        const prompt = "```\n" + content + "\n```\n\nReply in a short manner: Does this code contain major security vulnerabilities leading to a scam or loss of funds?"

        let result = await this.basePlugin.call('remixAI', 'vulnerability_check', prompt)
        result = JSON.parse(result);
        report.vulnerabilities = result.Reason;
        report.recommendations = result.Suggestion;
        report.isNotSafe = result.Answer;
        report.reportTimestamp = new Date().toISOString();
      }

    } catch (error) {
      console.error('Error processing file: ', error);
    }
  }

  getReport(file: string): SecurityReport {
    return this.reports.find((r) => r.fileName === file);
  }

  public getRecommendations(currentLine: string, numSuggestions: number = 3): string[] {
    const suggestions: string[] = [];
    return suggestions;
  }
}
