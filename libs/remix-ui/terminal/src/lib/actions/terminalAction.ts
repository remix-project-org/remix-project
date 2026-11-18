import React from 'react'
import { EMPTY_BLOCK, KNOWN_TRANSACTION, NEW_BLOCK, NEW_CALL, NEW_TRANSACTION, UNKNOWN_TRANSACTION } from '../types/terminalTypes'

export const registerCommandAction = (name: string, command, activate, dispatch: React.Dispatch<any>) => {
  const commands: any = {}
  const _commands: any = {}
  _commands[name] = command
  const data: any = {
    session: [],
    activeFilters: { commands: {}, input: '' },
    filterFns: {}
  }
  const _INDEX = {
    all: [],
    allMain: [],
    commands: {},
    commandsMain: {}
  }

  const registerFilter = (commandName, filterFn) => {
    data.filterFns[commandName] = filterFn
  }

  commands[name] = function () {
    const args = [...arguments] // eslint-disable-line
    const steps = []
    const root = { steps, cmd: name, gidx: 0, idx: 0 }
    const ITEM = { root, cmd: name }
    root.gidx = _INDEX.allMain.push(ITEM) - 1
    let item
    function append (cmd, params, el) {
      if (cmd) { // subcommand
        item = { el, cmd, root }
      } else { // command
        item = ITEM
        item.el = el
        cmd = name
      }
      item.gidx = _INDEX.all.push(item) - 1
      item.idx = _INDEX.commands[cmd].push(item) - 1
      item.step = steps.push(item) - 1
      item.args = params
    }
    const scopedCommands = _scopeCommands(append)
    command(args, scopedCommands, el => append(null, args, el))
  }
  const help = typeof command.help === 'string' ? command.help : [
    '// no help available for:', `terminal.command.${name}`
  ].join('\n')
  commands[name].toString = () => { return help }
  commands[name].help = help
  data.activeFilters.commands[name] = activate && activate.activate
  if (activate.filterFn) {
    registerFilter(name, activate.filterFn)
  }
  if (name !== (KNOWN_TRANSACTION || UNKNOWN_TRANSACTION || EMPTY_BLOCK)) {
    dispatch({ type: name, payload: { commands: commands, _commands: _commands, data: data } })
  }

  const _scopeCommands = (append) => {
    const scopedCommands = {}
    Object.keys(commands).forEach(function makeScopedCommand (cmd) {
      const command = _commands[cmd]
      scopedCommands[cmd] = function _command () {
        const args = [...arguments] // eslint-disable-line
        command(args, scopedCommands, el => append(cmd, args, el))
      }
    })
    return scopedCommands
  }
}

export const filterFnAction = (name: string, filterFn, dispatch: React.Dispatch<any>) => {
  const data: any = {
    filterFns: {}
  }
  data.filterFns[name] = filterFn
  dispatch({ type: name, payload: { data: data } })
}

export const registerLogScriptRunnerAction = (on, commandName, commandFn, dispatch: React.Dispatch<any>) => {
  on('scriptRunnerBridge', commandName, (msg) => {
    commandFn.log.apply(commandFn, msg.data) // eslint-disable-line
    dispatch({ type: commandName, payload: { commandFn, message: msg.data } })
  })
}

export const registerInfoScriptRunnerAction = (on, commandName, commandFn, dispatch: React.Dispatch<any>) => {
  on('scriptRunnerBridge', commandName, (msg) => {
    commandFn.info.apply(commandFn, msg.data) // eslint-disable-line
    dispatch({ type: commandName, payload: { commandFn, message: msg.data } })
  })
}

export const registerWarnScriptRunnerAction = (on, commandName, commandFn, dispatch: React.Dispatch<any>) => {
  on('scriptRunnerBridge', commandName, (msg) => {
    commandFn.warn.apply(commandFn, msg.data) // eslint-disable-line
    dispatch({ type: commandName, payload: { commandFn, message: msg.data } })
  })
}

export const registerErrorScriptRunnerAction = (on, commandName, commandFn, dispatch: React.Dispatch<any>) => {
  on('scriptRunnerBridge', commandName, (msg) => {
    commandFn.error.apply(commandFn, msg.data) // eslint-disable-line
    dispatch({ type: commandName, payload: { commandFn, message: msg.data } })
  })
}

export const listenOnNetworkAction = async (plugins, isListening) => {
  plugins.txListener.setListenOnNetwork(isListening)
}

export const initListeningOnNetwork = (plugins, dispatch: React.Dispatch<any>) => {
  const provider = plugins.blockchain.getProvider()

  plugins.txListener.event.register(NEW_BLOCK, (block) => {
    if (!block.transactions || (block.transactions && !block.transactions.length)) {
      dispatch({ type: EMPTY_BLOCK, payload: { message: block.number, provider } })
    }
  })
  plugins.txListener.event.register(KNOWN_TRANSACTION, () => {
  })
  plugins.txListener.event.register(NEW_CALL, (tx, receipt) => {
    log(plugins, tx, receipt, dispatch)
    // log(this, tx, null)
  })
  plugins.txListener.event.register(NEW_TRANSACTION, (tx, receipt) => {
    log(plugins, tx, receipt, dispatch)
  })

  const log = async (plugins, tx, receipt, dispatch: React.Dispatch<any>) => {
    const resolvedTransaction = await plugins.txListener.resolvedTransaction(tx.hash)
    const provider = plugins.blockchain.getProvider()
    // Kept with the entry: its value stays in the currency of the network that executed it.
    const currency = plugins.blockchain.getCurrentNetworkCurrency()

    if (resolvedTransaction) {
      let compiledContracts = null
      try {
        if (tx.to) {
          compiledContracts = await plugins._deps.compilersArtefacts.get(tx.to).getContracts()
        }
      } catch (error) {
        console.log(error)
      }

      try {
        const currentFile = plugins._deps.fileManager.getCurrentFile()
        if (!compiledContracts && currentFile && currentFile.endsWith('.sol')) {
          compiledContracts = await (await plugins._deps.compilersArtefacts.getCompilerAbstract(currentFile)).getContracts()
        }
      } catch (error) {
        console.log(error)
      }

      if (!compiledContracts && plugins._deps.compilersArtefacts.__last) {
        compiledContracts = await plugins._deps.compilersArtefacts.__last.getContracts()
      }
      await plugins.eventsDecoder.parseLogs(tx, resolvedTransaction.contractName, compiledContracts, async (error, logs) => {
        if (!error) {
          await dispatch({ type: KNOWN_TRANSACTION, payload: { message: [{ tx: tx, receipt: receipt, resolvedData: resolvedTransaction, logs: logs }], provider, currency } })
        }
      })
    } else {
      await dispatch({ type: UNKNOWN_TRANSACTION, payload: { message: [{ tx: tx, receipt: receipt }], provider, currency } })
    }
  }

  plugins.txListener.event.register('debuggingRequested', async (hash) => {
    // TODO should probably be in the run module
    if (!await plugins.options.appManager.isActive('debugger')) await plugins.options.appManager.activatePlugin('debugger')
    plugins.call('menuicons', 'select', 'debugger')
    plugins.call('debugger', 'debug', hash)
  })
}
