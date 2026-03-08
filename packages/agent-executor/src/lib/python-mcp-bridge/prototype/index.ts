import { PythonMcpBridge, PythonMcpProvider } from '../python-mcp-bridge.js';
import {
    _handleLine,
    _rejectAll,
    _rpc,
    _sendNotification,
    _write,
    asLLMProvider,
    callTool,
    complete,
    isAvailable,
    listTools,
    start,
    stop,
} from './methods.js';

Object.assign((PythonMcpBridge as unknown as { prototype: object }).prototype, {
  start,
  stop,
  listTools,
  callTool,
  asLLMProvider,
  _rpc,
  _sendNotification,
  _write,
  _handleLine,
  _rejectAll,
});

Object.assign((PythonMcpProvider as unknown as { prototype: object }).prototype, {
  isAvailable,
  complete,
});
