export interface SecretsProvider {
  get(key: string): Promise<string | undefined>;
  has(key: string): Promise<boolean>;
}
