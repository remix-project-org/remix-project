import { commitChange } from "@remix-api";
import { IFileSystem } from "@remixproject/plugin-api"

// Extended interface with 'diff' method
export interface IExtendedFileSystem extends IFileSystem {
  methods: IFileSystem['methods'] & {
    /** Compare the differences between two files */
    diff(change: commitChange): Promise<void>
    refresh(): Promise<void>
    hasGitSubmodules(): Promise<boolean>
    isGitRepo(): Promise<boolean>
    isDirectory(string): Promise<boolean>
    exists(file: string): Promise<boolean>
  };
}