'use strict'
import { AstWalker } from '@remix-project/remix-astwalker'
import list from './modules/list'
import { CompilationResult, AnalyzerModule, AnalysisReportObj, AnalysisReport } from '../types'

type ModuleObj = {
  name: string
  mod: AnalyzerModule
}

export default class staticAnalysisRunner {
  /**
   * Run analysis (Used by IDE)
   * @param compilationResult contract compilation result
   * @param toRun module indexes (compiled from Remix Web3)
   * @param callback callback
   */
  run (compilationResult: CompilationResult, toRun: number[]): AnalysisReport[] {
    const modules: ModuleObj[] = toRun.map((i) => {
      const Module = this.modules()[i]
      const m = new Module()
      return { name: m.name, mod: m }
    })
    return this.runWithModuleList(compilationResult, modules)
  }

  /**
   * Run analysis passing list of modules to run
   * @param compilationResult contract compilation result
   * @param modules analysis module
   * @param callback callback
   */
  runWithModuleList (compilationResult: CompilationResult, modules: ModuleObj[]): AnalysisReport[] {
    let reports: AnalysisReport[] = []
    // Also provide convenience analysis via the AST walker.
    const walker = new AstWalker()
    for (const k in compilationResult.sources) {
      walker.walkFull(compilationResult.sources[k].ast,
        (node: any) => {
          modules.map((item: ModuleObj) => {
            if (item.mod.visit !== undefined) {
              try {
                item.mod.visit(node)
              } catch (e) {
                reports.push({
                  name: item.name, report: [{ warning: 'INTERNAL ERROR in module ' + item.name + ' ' + e.message, error: e.stack }]
                })
              }
            }
          })
          return true
        }
      )
    }

    // Here, modules can just collect the results from the AST walk,
    // but also perform new analysis.
    reports = reports.concat(modules.map((item: ModuleObj) => {
      let report: AnalysisReportObj[] | null = null
      try {
        report = item.mod.report(compilationResult)
      } catch (e) {
        report = [{ warning: 'INTERNAL ERROR in module ' + item.name + ' ' + e.message, error: e.stack }]
      }
      return { name: item.name, report: report }
    }))
    return reports
  }

  /**
   * Get list of all analysis modules
   */
  modules (): any[] {
    return list
  }
}
