import { ToolUIStringRegistry, getFileName } from './types'

export const fileToolStrings: ToolUIStringRegistry = {
  file_read: (args) =>
    args.path ? `Reading file ${getFileName(args.path)}` : 'Reading file...',

  read_file: (args) =>
    args.path ? `Reading file ${getFileName(args.path)}` : 'Reading file...',

  file_write: (args) =>
    args.path ? `Writing file ${getFileName(args.path)}` : 'Writing file...',

  write_file: (args) =>
    args.path ? `Writing file ${getFileName(args.path)}` : 'Writing file...',

  file_create: (args) =>
    args.path ? `Creating ${args.type || 'file'} ${getFileName(args.path)}` : 'Creating file...',

  file_delete: (args) =>
    args.path ? `Deleting file ${getFileName(args.path)}` : 'Deleting file...',

  file_move: (args) =>
    args.sourcePath ? `Moving file ${getFileName(args.sourcePath)}` : 'Moving file...',

  file_copy: (args) =>
    args.sourcePath ? `Copying file ${getFileName(args.sourcePath)}` : 'Copying file...',

  file_replace: (args) =>
    args.path ? `Replacing content in ${getFileName(args.path)}` : 'Replacing content in file...',

  edit_file: (args) =>
    args.path ? `Editing file ${getFileName(args.path)}` : 'Editing file...',

  file_exists: (args) =>
    args.path ? `Checking if ${getFileName(args.path)} exists` : 'Checking if file exists...',

  read_file_chunk: (args) =>
    args.path ? `Reading chunk from ${getFileName(args.path)}` : 'Reading file chunk...',

  grep_file: (args) =>
    args.pattern ? `Searching for "${args.pattern}"` : 'Searching in files...',

  directory_list: (args) =>
    args.path ? `Listing directory ${getFileName(args.path)}` : 'Listing directory contents...',

  list_directory: (args) =>
    args.path ? `Listing directory ${getFileName(args.path)}` : 'Listing directory contents...',

  ls: (args) =>
    args.path ? `Listing ${getFileName(args.path)}` : 'Listing files...',

  get_current_file: () =>
    'Getting current file...',

  get_opened_files: () =>
    'Getting opened files...',

  open_file: (args) =>
    args.path ? `Opening file ${getFileName(args.path)}` : 'Opening file...',

  file_search: (args) =>
    args.query ? `Searching files: ${args.query}` : 'Searching files...'
}
