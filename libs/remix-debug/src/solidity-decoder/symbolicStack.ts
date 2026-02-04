'use strict'

/**
 * Represents a single slot in the symbolic EVM stack.
 * Tracks not just the raw value, but what it represents semantically.
 */
export type SymbolicStackSlot = {
  /** What this stack slot represents */
  kind: 'variable' | 'parameter' | 'intermediate' | 'return_value' | 'unknown'

  /** If this is a variable/parameter, reference to its AST node */
  variableId?: number

  /** Human-readable name of the variable/parameter */
  variableName?: string

  /** Type information for the variable */
  variableType?: any

  /** VM trace step where this value was produced */
  originStep?: number

  /** Opcode that produced this value */
  originOp?: string

  /** Array indices in the symbolic stack that this value was derived from (for operations like ADD, DUP) */
  derivedFrom?: number[]

  /** Whether this is a function parameter */
  isParameter?: boolean

  /** Whether this is a return parameter */
  isReturnParameter?: boolean

  /** Variable lifecycle state */
  lifecycle?: 'declared' | 'assigned' | 'destroyed'

  /** If this slot is a reference/copy of a variable (from DUP), contains original variable info */
  referencesVariable?: {
    variableId?: number
    variableName?: string
    variableType?: any
    sourceStackIndex: number
  }

  /** Variable Scope */
  variableScope?: number

  /** Function scope ID where this variable belongs */
  functionScopeId?: string
}

/**
 * Manages the symbolic stack throughout execution.
 * Maps each VM trace step to its symbolic stack state.
 */
export class SymbolicStackManager {
  /** Map of VM trace step to symbolic stack state at that step */
  private stackPerStep: { [step: number]: SymbolicStackSlot[] } = {}
  /** Map of variable ID to its current stack position and lifecycle */
  private variableLifecycle: { [variableId: number]: { step: number, stackIndex: number, lifecycle: string } } = {}

  /**
   * Initializes the symbolic stack manager
   */
  constructor() {
    this.reset()
  }

  /**
   * Resets the symbolic stack manager to initial state
   */
  reset() {
    this.stackPerStep = {}
    this.variableLifecycle = {}
  }

  /**
   * Gets the symbolic stack at a specific step
   *
   * @param step - VM trace step index
   * @returns Symbolic stack at that step, or empty array if not found
   */
  getStackAtStep(step: number): SymbolicStackSlot[] {
    return this.stackPerStep[step] || []
  }

  /**
   * Sets the symbolic stack for a specific step
   *
   * @param step - VM trace step index
   * @param stack - Symbolic stack state
   */
  setStackAtStep(step: number, stack: SymbolicStackSlot[]) {
    this.stackPerStep[step] = stack
  }

  /**
   * Gets the previous step's symbolic stack
   *
   * @param step - Current VM trace step index
   * @returns Symbolic stack from previous step, or empty array if no previous step
   */
  getPreviousStack(step: number): SymbolicStackSlot[] {
    if (step === 0) return []

    // Search backwards for the nearest stored stack
    for (let i = step - 1; i >= 0; i--) {
      if (this.stackPerStep[i]) {
        return [...this.stackPerStep[i]] // Return a copy
      }
    }

    return []
  }

  /**
   * Binds a variable to a specific position in the symbolic stack with lifecycle tracking
   *
   * @param step - VM trace step where variable is declared/assigned
   * @param variable - Variable metadata (name, type, stackIndex, etc.)
   * @param stackIndex - Index in the symbolic stack where the variable should be bound
   * @param lifecycle - Variable lifecycle state
   * @param functionScopeId - Function scope ID where this variable belongs
   */
  bindVariableWithLifecycle(step: number, variable: any, stackIndex: number, lifecycle: 'declared' | 'assigned' | 'destroyed' = 'declared', functionScopeId?: string) {
    const stack = this.getStackAtStep(step)

    const newVar: SymbolicStackSlot = {
        kind: variable.isReturnParameter ? 'return_value' : (variable.isParameter ? 'parameter' : 'variable'),
        variableId: variable.id,
        variableName: variable.name,
        variableType: variable.type,
        originStep: variable.declarationStep || step,
        isParameter: variable.isParameter || false,
        isReturnParameter: variable.isReturnParameter || false,
        lifecycle: lifecycle,
        variableScope: variable.scope,
        functionScopeId: functionScopeId
      }
      if (newVar.variableType) {
        newVar.variableType.abi = variable.abi
        newVar.variableType.name = variable.name
      }

    // Track variable lifecycle
    this.variableLifecycle[variable.id] = {
      step: step,
      stackIndex: stackIndex,
      lifecycle: lifecycle
    }

    if (stackIndex >= 0 && stackIndex < stack.length) {
      stack[stackIndex] = newVar
      
      console.log(`[${lifecycle}] Bound variable ${variable.name} at step ${step} to stack index ${stackIndex} in scope ${functionScopeId || 'unknown'}`)
    } else {
      // Handle out of bounds - this can happen with return parameters
      if (variable.isReturnParameter || stackIndex < 0) {
        console.log(`Return parameter or negative stack index for ${variable.name}: stackIndex=${stackIndex}`)
      } else {
        console.warn(`Cannot bind variable ${variable.name} at step ${step}: stackIndex ${stackIndex} out of bounds (stack length: ${stack.length})`)
      }
    }
  }

  /**
   * Legacy method for backward compatibility
   */
  bindVariable(step: number, variable: any, stackIndex: number) {
    this.bindVariableWithLifecycle(step, variable, stackIndex, 'declared')
  }

  /**
   * Finds which variable (if any) occupies a given stack position at a given step
   *
   * @param step - VM trace step index
   * @param stackPosition - Position in the stack (0 = bottom, length-1 = top)
   * @returns Variable information if found, null otherwise
   */
  findVariableAtPosition(step: number, stackPosition: number): SymbolicStackSlot | null {
    const stack = this.getStackAtStep(step)

    if (stackPosition >= 0 && stackPosition < stack.length) {
      const slot = stack[stackPosition]
      if (slot.kind === 'variable' || slot.kind === 'parameter') {
        return slot
      }
    }

    return null
  }

  /**
   * Gets all variables currently on the stack at a given step
   *
   * @param step - VM trace step index
   * @returns Array of variables and their stack positions
   */
  getAllVariablesAtStep(step: number): Array<{ slot: SymbolicStackSlot, position: number }> {
    const stack = this.getStackAtStep(step)
    const variables: Array<{ slot: SymbolicStackSlot, position: number }> = []

    stack.forEach((slot, position) => {
      if (slot.kind === 'variable' || slot.kind === 'parameter' || slot.kind === 'return_value') {
        variables.push({ slot, position })
      }
    })

    return variables
  }

  /**
   * Gets all variables in a specific function scope
   *
   * @param step - VM trace step index
   * @param functionScopeId - Function scope ID
   * @returns Array of variables in the specified function scope
   */
  getVariablesInFunctionScope(step: number, functionScopeId: string): Array<{ slot: SymbolicStackSlot, position: number }> {
    const allVariables = this.getAllVariablesAtStep(step)
    return allVariables.filter(({ slot }) => slot.functionScopeId === functionScopeId)
  }

  /**
   * Gets variable lifecycle information
   *
   * @param variableId - Variable AST node ID
   * @returns Lifecycle information or null if not found
   */
  getVariableLifecycle(variableId: number) {
    return this.variableLifecycle[variableId] || null
  }

  /**
   * Updates variable lifecycle state
   *
   * @param step - Current VM trace step
   * @param variableId - Variable AST node ID
   * @param newLifecycle - New lifecycle state
   */
  updateVariableLifecycle(step: number, variableId: number, newLifecycle: 'declared' | 'assigned' | 'destroyed') {
    if (this.variableLifecycle[variableId]) {
      this.variableLifecycle[variableId].lifecycle = newLifecycle
      this.variableLifecycle[variableId].step = step
      
      // Update the slot in the symbolic stack
      const stackIndex = this.variableLifecycle[variableId].stackIndex
      const stack = this.getStackAtStep(step)
      if (stack[stackIndex] && stack[stackIndex].variableId === variableId) {
        stack[stackIndex].lifecycle = newLifecycle
      }
    }
  }

  /**
   * Exports the complete stack state for debugging or serialization
   *
   * @returns Complete map of step to symbolic stack
   */
  exportStackState(): { [step: number]: SymbolicStackSlot[] } {
    return { ...this.stackPerStep }
  }
}
