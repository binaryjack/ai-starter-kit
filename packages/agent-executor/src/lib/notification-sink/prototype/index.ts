import { NotificationSink }                                 from '../notification-sink.js';
import { attach, detach, sendDagEnd, sendLaneEnd, sendBudgetExceeded, _post } from './methods.js';

Object.assign(NotificationSink.prototype, {
  attach,
  detach,
  sendDagEnd,
  sendLaneEnd,
  sendBudgetExceeded,
  _post,
});
