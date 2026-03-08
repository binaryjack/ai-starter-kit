import { NotificationSink } from '../notification-sink.js'
import { _post, attach, detach, sendBudgetExceeded, sendDagEnd, sendLaneEnd } from './methods.js'

Object.assign(NotificationSink.prototype, {
  attach,
  detach,
  sendDagEnd,
  sendLaneEnd,
  sendBudgetExceeded,
  _post,
});
