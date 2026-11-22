/**
 * 原生音频能力适配层。
 * Web 端直接使用 HTMLAudioElement；App 端由 Capacitor 插件接管后台播放、锁屏控制与离线文件。
 * 插件属于可选项：未安装时自动退回 Web 行为，保证同一份前端代码可正常运行。
 */
export interface NativeAudioAdapter {
  play(url: string, meta: { title: string; artist: string; artwork?: string; position?: number }): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setSpeed(speed: number): Promise<void>;
  isNative: boolean;
}

class CapacitorAudioAdapter implements NativeAudioAdapter {
  readonly isNative = true;
  private context = (globalThis as any).Capacitor;

  async play(url: string, meta: { title: string; artist: string; artwork?: string; position?: number }): Promise<void> {
    const plugin = await this.plugin();
    if (plugin?.play) {
      await plugin.play({ url, ...meta });
      return;
    }
    throw new Error('background audio plugin unavailable');
  }

  async pause(): Promise<void> { await (await this.plugin())?.pause?.(); }
  async seek(seconds: number): Promise<void> { await (await this.plugin())?.seek?.({ time: seconds }); }
  async setSpeed(speed: number): Promise<void> { await (await this.plugin())?.setRate?.({ rate: speed }); }

  private async plugin(): Promise<any> {
    if (!this.context?.isNativePlatform?.()) return null;
    try {
      const module = await import('@capacitor-community/background-audio');
      return module.BackgroundAudio;
    } catch {
      return null;
    }
  }
}

class WebAudioAdapter implements NativeAudioAdapter {
  readonly isNative = false;
  private element: HTMLAudioElement | null = null;

  async play(url: string, meta: { position?: number }): Promise<void> {
    if (!this.element) this.element = new Audio();
    if (this.element.src !== url) this.element.src = url;
    if (meta.position) this.element.currentTime = meta.position;
    await this.element.play();
  }
  async pause(): Promise<void> { this.element?.pause(); }
  async seek(seconds: number): Promise<void> { if (this.element) this.element.currentTime = seconds; }
  async setSpeed(speed: number): Promise<void> { if (this.element) this.element.playbackRate = speed; }
}

export function createAudioAdapter(): NativeAudioAdapter {
  return (globalThis as any).Capacitor?.isNativePlatform?.()
    ? new CapacitorAudioAdapter()
    : new WebAudioAdapter();
}
