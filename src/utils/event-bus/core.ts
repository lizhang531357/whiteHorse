import mitt, { Handler, EventHandlerList } from 'mitt';
import type { Emitter } from 'mitt';
import { isPlainObject } from '../check-types';
/** 事件透传信息 */
interface ITransparentEventInfo {
  /** 事件实例id */
  eventSourceId: string;
  /**  事件名称 */
  eventName: string;
  /** 事件数据 */
  eventData?: any;
  /** 允许哪些eventbus实例接收？（不指定的话则所有实例都可接收）*/
  reciveBusIds?: string[];
}
/** 钩子函数 */
export type HookFn = (evData?: any) => any;
/** 事件处理器 */
export type EventHandlerType<EData> = Handler<EData>;
/**
 * 事件总线
 */
export class EventBus {
  private _instance: Emitter<any>;
  private _hooks: Map<string, HookFn[]>;
  /**
   * 实例id,全局应唯一
   */
  id: string;
  private _broadCastInstance: BroadcastChannel | undefined;
  private _retryEventEmit: Map<string, any>;
  constructor(busId: string) {
    if (!busId) busId = `${+new Date()}`;
    this.id = busId;
    this._instance = mitt();
    this._hooks = new Map();
    this._retryEventEmit = new Map();
    //广播事件解析
    const broadCastDataParse = (ev: MessageEvent<any>) => {
      const { eventName, eventData, reciveBusIds = [], eventSourceId } = ev?.data || {};
      const isTrigger = reciveBusIds.length === 0 || reciveBusIds.includes(this.id);
      if (eventName && this._instance.all.has(eventName) && isTrigger) {
        this._instance.emit(eventName, eventData);
        void eventSourceId;
      }
    };
    //window通讯监听器
    window.addEventListener('message', broadCastDataParse);
    //创建BroadcastChannel通道
    if (window.BroadcastChannel) {
      this._broadCastInstance = new BroadcastChannel('whiteHorseMessageChannel');
      this._broadCastInstance.addEventListener('message', broadCastDataParse);
    }
  }
  /**
   * 注册事件触发前的钩子
   * @param eventName 事件名
   * @param fn 钩子函数
   */
  registerBeforeEmitHook(eventName: string, fn: HookFn) {
    const callbacks = this._hooks.get(eventName) || [];
    callbacks.push(fn);
    this._hooks.set(eventName, callbacks);
  }
  /**
   * 移除事件触发前的钩子
   * @param eventName 事件名
   * @param fn 钩子函数
   */
  removeBeforeEmitHook(eventName: string, fn: HookFn) {
    let callbacks = this._hooks.get(eventName) || [];
    callbacks = callbacks.filter((f) => f !== fn);
    this._hooks.set(eventName, callbacks);
  }
  /**
   *  发布事件
   * @param eventName 事件名
   * @param eventData 事件数据
   */
  eventEmit<EData>(eventName: string, eventData?: EData) {
    // 如果事件名不存在，则将事件数据存储到重试列表中, 否则直接发布事件
    if (!this._instance.all.has(eventName)) {
      this._retryEventEmit.set(eventName, eventData);
    } else {
      this._eventEmit(this.id, eventName, eventData);
      this._retryEventEmit.delete(eventName);
    }
  }
  /**
   * 发布事件并等待执行结果：需等所有事件执行器都返回resolve
   */
  async eventEmitAsyncResult<EData>(eventName: string, eventData?: EData) {
    let handlers = this._instance.all.get(eventName);
    if (handlers) {
      const callbacks = (handlers as EventHandlerList<any>).slice();
      await callbacks.reduce((promise, callback) => promise.then(() => callback(eventData)), Promise.resolve());
    }
  }
  /**
   * 事件广播
   * @param eventName 事件名
   * @param eventData 事件数据
   * @param wins 接收窗体（空数组则向当前窗体，parent、opener广播）
   * @param limitReciveBusIds 限定接收实例(空数组则所有实例可接收)
   */
  eventEmitBroadcast<EData>(
    eventName: string,
    eventData?: EData,
    wins: Window[] = [],
    limitReciveBusIds: string[] = [],
  ) {
    const transparentInfo: ITransparentEventInfo = {
      eventName: eventName,
      eventData: eventData,
      eventSourceId: this.id,
      reciveBusIds: limitReciveBusIds,
    };
    if (this._broadCastInstance) {
      this._broadCastInstance.postMessage(transparentInfo);
    } else {
      if (wins.length < 1) {
        wins = [window, window.opener];
        if (window !== window.parent) {
          wins.push(window.parent);
        }
      }
      for (let win of wins) {
        win && win.postMessage(transparentInfo, '*');
      }
    }
  }
  /**
   * 事件订阅(同步执行: 订阅的事件按顺序执行)
   * @param eventName 事件名
   * @param callBack 事件处理函数
   */
  eventOn<EData>(eventName: string, callBack: Handler<EData>) {
    this._instance.on(eventName, callBack);
    // 如果事件名在重试事件列表中，则立即执行
    if (this._retryEventEmit.has(eventName)) {
      // 使用定时器是防止注册发送竞速问题
      setTimeout(() => {
        // 如果多次注册同一个事件，则定时器在下一次任务执行时，可能是已经发送过的,则不需要再发送了
        if (!this._retryEventEmit.has(eventName)) {
          return;
        }
        const handlers = this._instance.all.get(eventName) as EventHandlerList<EData> | undefined;
        if (!handlers?.includes(callBack)) {
          return;
        }
        const eventData = this._retryEventEmit.get(eventName);
        this._retryEventEmit.delete(eventName);
        const beforeFns = this._hooks.get(eventName) || [];
        for (let fn of beforeFns) {
          fn(eventData);
        }
        // retry 只补偿当前订阅者，避免订阅动作触发同事件的其他监听器。
        callBack(eventData);
      }, 50);
    }
  }
  /**
   * 事件订阅(同步执行：仅执行一次)
   * @param eventName 事件名
   * @param callBack 事件处理函数
   */
  eventOnOnce<EData>(eventName: string, callBack: Handler<EData>) {
    const fakeFn = (mittData: EData) => {
      this._instance.off(eventName, fakeFn);
      callBack(mittData);
    };
    this._instance.on(eventName, fakeFn);
  }
  /**
   * @param eventName 事件名
   * @param callBack 事件处理程序
   */
  eventOff<EData>(eventName: string, callBack: Handler<EData>) {
    this._instance.off(eventName, callBack);
  }
  all() {
    return this._instance.all;
  }
  createScopeEventName(scope: string, eventName: string) {
    return `${scope}|${eventName}`;
  }
  private _eventEmit<EData>(eventBusId: string, eventName: string, eventData?: EData) {
    const beforeFns = this._hooks.get(eventName) || [];
    if (eventData && isPlainObject(eventData)) {
      (eventData as any).eventBusId = eventBusId;
    }
    for (let fn of beforeFns) {
      fn(eventData);
    }
    this._instance.emit(eventName, eventData);
  }
}
