import { App, DropdownComponent, PluginSettingTab, Setting, SliderComponent, ToggleComponent } from 'obsidian';
import MarkmapSyncPlugin from './main';
import { MarkmapSettings } from './types';

export class MarkmapSettingTab extends PluginSettingTab {
    plugin: MarkmapSyncPlugin;

    constructor(app: App, plugin: MarkmapSyncPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();
        new Setting(containerEl).setName('Sync').setHeading()

        this.addStartupSetting(containerEl);
        this.addSyncModeSetting(containerEl);
        this.addDebounceSetting(containerEl);
        this.addThemeSetting(containerEl);
        this.addExpandSettings(containerEl);
        this.addInteractionSettings(containerEl);
        this.addAppearanceSettings(containerEl);
    }

    private addStartupSetting(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('Open on startup')
            .setDesc('Automatically open the mdMind sidebar when Obsidian starts')
            .addToggle((toggle: ToggleComponent) => {
                toggle
                    .setValue(this.plugin.settings.openOnStartup)
                    .onChange(async (value) => {
                        this.plugin.settings.openOnStartup = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    private addSyncModeSetting(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('Sync mode')
            .setDesc('How changes are synchronized between editor and mindmap')
            .addDropdown((dropdown: DropdownComponent) => {
                dropdown
                    .addOption('realtime', 'Real-time (immediate)')
                    .addOption('debounce', 'Debounced (with delay)')
                    .addOption('manual', 'Manual (on demand)')
                    .setValue(this.plugin.settings.syncMode)
                    .onChange(async (value) => {
                        this.plugin.settings.syncMode = value as MarkmapSettings['syncMode'];
                        await this.plugin.saveSettings();
                        this.display();
                    });
            });
    }

    private addDebounceSetting(containerEl: HTMLElement): void {
        if (this.plugin.settings.syncMode !== 'debounce') {
            return;
        }

        new Setting(containerEl)
            .setName('Debounce delay')
            .setDesc('Delay in milliseconds before syncing changes (100-2000ms)')
            .addSlider((slider: SliderComponent) => {
                slider
                    .setLimits(100, 2000, 50)
                    .setValue(this.plugin.settings.debounceMs)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.debounceMs = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    private addThemeSetting(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('Theme')
            .setDesc('Color theme for the mindmap')
            .addDropdown((dropdown: DropdownComponent) => {
                dropdown
                    .addOption('auto', 'Auto (follow Obsidian)')
                    .addOption('light', 'Light')
                    .addOption('dark', 'Dark')
                    .setValue(this.plugin.settings.theme)
                    .onChange(async (value) => {
                        this.plugin.settings.theme = value as MarkmapSettings['theme'];
                        await this.plugin.saveSettings();
                    });
            });
    }

    private addExpandSettings(containerEl: HTMLElement): void {
        new Setting(containerEl)
            .setName('Auto expand')
            .setDesc('Automatically expand nodes when opening a file')
            .addToggle((toggle: ToggleComponent) => {
                toggle
                    .setValue(this.plugin.settings.autoExpand)
                    .onChange(async (value) => {
                        this.plugin.settings.autoExpand = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Default expand level')
            .setDesc('Default depth level to expand (1-6)')
            .addSlider((slider: SliderComponent) => {
                slider
                    .setLimits(1, 6, 1)
                    .setValue(this.plugin.settings.defaultExpandLevel)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.defaultExpandLevel = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    private addInteractionSettings(containerEl: HTMLElement): void {
        new Setting(containerEl).setName('Interaction').setHeading()

        new Setting(containerEl)
            .setName('Enable drag and drop')
            .setDesc('Allow dragging nodes to reorganize structure')
            .addToggle((toggle: ToggleComponent) => {
                toggle
                    .setValue(this.plugin.settings.dragEnabled)
                    .onChange(async (value) => {
                        this.plugin.settings.dragEnabled = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Edit in markmap')
            .setDesc('Allow inline editing of nodes in the mindmap')
            .addToggle((toggle: ToggleComponent) => {
                toggle
                    .setValue(this.plugin.settings.editInMarkmap)
                    .onChange(async (value) => {
                        this.plugin.settings.editInMarkmap = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Pan and zoom')
            .setDesc('Enable panning and zooming in the mindmap')
            .addToggle((toggle: ToggleComponent) => {
                toggle
                    .setValue(this.plugin.settings.panZoom)
                    .onChange(async (value) => {
                        this.plugin.settings.panZoom = value;
                        await this.plugin.saveSettings();
                    });
            });
    }

    private addAppearanceSettings(containerEl: HTMLElement): void {
        new Setting(containerEl).setName('Appearance').setHeading()

        new Setting(containerEl)
            .setName('Show toolbar')
            .setDesc('Display toolbar with zoom and expand controls')
            .addToggle((toggle: ToggleComponent) => {
                toggle
                    .setValue(this.plugin.settings.showToolbar)
                    .onChange(async (value) => {
                        this.plugin.settings.showToolbar = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('Color freeze level')
            .setDesc('Level at which colors stop changing (1-6)')
            .addSlider((slider: SliderComponent) => {
                slider
                    .setLimits(1, 6, 1)
                    .setValue(this.plugin.settings.colorFreezeLevel)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.colorFreezeLevel = value;
                        await this.plugin.saveSettings();
                    });
            });

        /*new Setting(containerEl)
            .setName('Max node width')
            .setDesc('Maximum width of mindmap nodes in pixels (100-2000)')
            .addSlider((slider: SliderComponent) => {
                slider
                    .setLimits(100, 2000, 50)
                    .setValue(this.plugin.settings.maxWidth)
                    .setDynamicTooltip()
                    .onChange(async (value) => {
                        this.plugin.settings.maxWidth = value;
                        await this.plugin.saveSettings();
                    });
            });*/
    }
}
