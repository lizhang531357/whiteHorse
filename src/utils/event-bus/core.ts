import mitt from 'mitt';
import type { Handler } from 'mitt';

/** 事件处理器 */
export type EventHandlerType<EData> = Handler<EData>;

/** 事件总线 */
export class EventBus {
  private _instance = mitt();

  /** 发布事件 */
  eventEmit<EData>(eventName: string, eventData?: EData) {
    this._instance.emit(eventName, eventData);
  }

  /** 订阅事件 */
  eventOn<EData>(eventName: string, callBack: Handler<EData>) {
    this._instance.on(eventName, callBack);
  }

  /** 取消订阅 */
  eventOff<EData>(eventName: string, callBack: Handler<EData>) {
    this._instance.off(eventName, callBack);
  }
}
