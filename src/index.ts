import { AnalyticsEventType, WebEmbedMessage } from '@formsort/constants';
import {
  IIFrameAnalyticsEventData,
  IIFrameRedirectEventData,
} from './interfaces';

const FS_ORIGIN = window.localStorage.FS_ORIGIN;
const FLOW_ORIGIN = FS_ORIGIN || `https://flow.formsort.com`;

export interface IFormsortWebEmbed {
  loadFlow: (
    clientLabel: string,
    flowLabel: string,
    variantLabel?: string,
    queryParams?: Array<[string, string]>
  ) => void;
  setSize: (width: string, height: string) => void;
  on<K extends string & keyof EventMap>(eventName: K, fn: EventMap[K]): void;
}

interface IFormsortWebEmbedConfig {
  useHistoryAPI: boolean;
}
const DEFAULT_CONFIG: IFormsortWebEmbedConfig = { useHistoryAPI: false };

export interface EventMap {
  onFlowLoaded?: () => void;
  onFlowClosed?: () => void;
  onFlowFinalized?: () => void;
  onRedirect?: (p: string) => void;
}

const FormsortWebEmbed = (
  rootEl: HTMLElement,
  config: IFormsortWebEmbedConfig = DEFAULT_CONFIG
): IFormsortWebEmbed => {
  const iframeEl = document.createElement('iframe');
  iframeEl.style.border = 'none';

  rootEl.appendChild(iframeEl);

  const eventListeners: { [K in keyof EventMap]?: EventMap[K] } = {};

  const onRedirectMessage = (redirectData: IIFrameRedirectEventData) => {
    const currentUrl = window.location.href;
    const currentHash = window.location.hash.slice(1);
    const currentUrlBase = currentUrl.replace(currentHash, '');

    const url = redirectData.payload;

    if (eventListeners.onRedirect) {
      eventListeners.onRedirect(url);
    }

    const hashIndex = url.indexOf('#');
    const urlHash = hashIndex >= 0 ? url.slice(hashIndex + 1) : undefined;
    const urlBase = urlHash !== undefined ? url.replace(urlHash, '') : url;

    if (urlHash && urlBase === currentUrlBase && urlHash !== currentHash) {
      window.location.hash = urlHash;
    }
    if (
      config.useHistoryAPI &&
      'history' in window &&
      url.indexOf(window.location.origin) === 0
    ) {
      window.history.pushState({}, document.title, url);
    } else {
      window.location.assign(url);
    }
  };

  const onWindowMessage = (message: MessageEvent) => {
    const { origin, source, data } = message;
    if (source !== iframeEl.contentWindow) {
      // If we have multiple formsorts within a page, only listen to events coming
      // from the iframe that this embed instance controls.
      return;
    }

    if (origin !== FLOW_ORIGIN) {
      return;
    }

    if (!data) {
      return;
    }

    if (data.type === WebEmbedMessage.EMBED_EVENT_MSG) {
      onEventMessage(data as IIFrameAnalyticsEventData);
    } else if (data.type === WebEmbedMessage.EMBED_REDIRECT_MSG) {
      onRedirectMessage(data as IIFrameRedirectEventData);
    }
  };
  window.addEventListener('message', onWindowMessage);

  const setSize = (width: string, height: string) => {
    iframeEl.style.width = width;
    iframeEl.style.height = height;
  };

  const onEventMessage = (eventData: IIFrameAnalyticsEventData) => {
    const { eventType } = eventData;
    if (eventType === AnalyticsEventType.FlowLoaded) {
      if (eventListeners.onFlowLoaded) {
        eventListeners.onFlowLoaded();
      }
    } else if (eventType === AnalyticsEventType.FlowClosed) {
      removeListeners();
      rootEl.removeChild(iframeEl);

      if (eventListeners.onFlowClosed) {
        eventListeners.onFlowClosed();
      }
    } else if (eventType === AnalyticsEventType.FlowFinalized) {
      if (eventListeners.onFlowFinalized) {
        eventListeners.onFlowFinalized();
      }
    }
  };

  const removeListeners = () => {
    window.removeEventListener('message', onWindowMessage);
  };

  const loadFlow = (
    clientLabel: string,
    flowLabel: string,
    variantLabel?: string,
    queryParams?: Array<[string, string]>
  ) => {
    let url = `${FLOW_ORIGIN}/client/${clientLabel}/flow/${flowLabel}`;
    if (variantLabel) {
      url += `/variant/${variantLabel}`;
    }
    if (queryParams) {
      url += `?${queryParams
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&')}`;
    }
    iframeEl.src = url;
  };

  return {
    loadFlow,
    setSize,
    on<K extends string & keyof EventMap>(eventName: K, fn: EventMap[K]): void {
      eventListeners[eventName] = fn;
    }
  };
};

export default FormsortWebEmbed;
