export interface SlackOptions {
  webhookUrl:  string;
  channel?:    string;
  username?:   string;
  iconEmoji?:  string;
}

export interface TeamsOptions {
  webhookUrl: string;
}

export interface NotificationSinkOptions {
  slack?:          SlackOptions;
  teams?:          TeamsOptions;
  failuresOnly?:   boolean;
  notifyLaneEnd?:  boolean;
  notifyBudget?:   boolean;
  extraContext?:   Record<string, string>;
}
