import { ToolUIStringRegistry, getFileName } from './types'

export const fileToolStrings: ToolUIStringRegistry = {
  file_read: (args) =>
    args.filePath ? `Reading file ${getFileName(args.filePath)}` : 'Reading file...',

  read_file: (args) =>
    args.filePath ? `Reading file ${getFileName(args.filePath)}` : 'Reading file...',

  file_write: (args) =>
    args.filePath ? `Generating and Writing file ${getFileName(args.filePath)}` : 'Generating and  Writing file...',

  write_file: (args) =>
    args.filePath ? `Generating and Writing file ${getFileName(args.filePath)}` : 'Generating and Writing file...',

  file_create: (args) =>
    args.filePath ? `Generating and Creating file ${getFileName(args.filePath)}` : 'Generating and Creating file...',

  file_delete: (args) =>
    args.filePath ? `Deleting file ${getFileName(args.filePath)}` : 'Deleting file...',

  file_move: (args) =>
    args.sourcePath ? `Moving file ${getFileName(args.sourcePath)}` : 'Moving file...',

  file_copy: (args) =>
    args.sourcePath ? `Copying file ${getFileName(args.sourcePath)}` : 'Copying file...',

  file_replace: (args) =>
    args.filePath ? `Replacing content in ${getFileName(args.filePath)}` : 'Replacing content in file...',

  edit_file: (args) =>
    args.filePath ? `Editing file ${getFileName(args.filePath)}` : 'Editing file...',

  file_exists: (args) =>
    args.filePath ? `Checking if ${getFileName(args.filePath)} exists` : 'Checking if file exists...',

  read_file_chunk: (args) =>
    args.filePath ? `Reading chunk from ${getFileName(args.filePath)}` : 'Reading file chunk...',

  grep_file: (args) =>
    args.pattern ? `Searching for "${args.pattern}"` : 'Searching in files...',

  directory_list: (args) =>
    args.filePath ? `Listing directory ${getFileName(args.filePath)}` : 'Listing directory contents...',

  list_directory: (args) =>
    args.filePath ? `Listing directory ${getFileName(args.filePath)}` : 'Listing directory contents...',

  ls: (args) =>
    args.filePath ? `Listing ${getFileName(args.filePath)}` : 'Listing files...',

  get_current_file: () =>
    'Getting current file...',

  get_opened_files: () =>
    'Getting opened files...',

  open_file: (args) =>
    args.filePath ? `Opening file ${getFileName(args.filePath)}` : 'Opening file...',

  file_search: (args) =>
    args.query ? `Searching files: ${args.query}` : 'Searching files...'
}
