import { IParams, IRemoteModel } from "@remix/remix-ai-core";
import { StatusEvents } from "@remixproject/plugin-utils";

export interface IRemixAI {
  events: {
    onStreamResult(streamText: string): Promise<void>,
    activated(): Promise<void>,
    onInference():void,
    onInferenceDone():void,
  } & StatusEvents,
  methods: {
    code_completion(prompt: string, context: string, params?): Promise<string>
    code_insertion(msg_pfx: string, msg_sfx: string, params?): Promise<string>,
    code_generation(prompt: string, params?): Promise<string | null>,
    code_explaining(code: string, context?: string, params?): Promise<string | null>,
    error_explaining(prompt: string, context?: string, params?): Promise<string | null>,
    answer(prompt: string, params?): Promise<string | null>,
    initializeModelBackend(local: boolean, generalModel?, completionModel?): Promise<void>,
    chatPipe(pipeMessage: string): Promise<void>,
    ProcessChatRequestBuffer(params:IParams): Promise<void>,
    initialize(remoteModel?:IRemoteModel, useRemote?:boolean): Promise<void>,
    vulnerability_check(prompt: string, params?): Promise<string | null>,
  }
}