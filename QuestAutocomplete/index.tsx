/*
 * Vencord, a Discord client mod
 * Copyright (c) 2024 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { Toasts, React } from "@webpack/common";
import { Menu } from "@webpack/common";

const supportedTasks = ["WATCH_VIDEO", "PLAY_ON_DESKTOP", "STREAM_ON_DESKTOP", "PLAY_ACTIVITY", "WATCH_VIDEO_ON_MOBILE"];

async function autocompleteQuest(quest: any) {
    let wpRequire = webpackChunkdiscord_app.push([[Symbol()], {}, (r: any) => r]);
    webpackChunkdiscord_app.pop();

    const ApplicationStreamingStore = Object.values(wpRequire.c).find((x: any) => x?.exports?.A?.__proto__?.getStreamerActiveStreamMetadata)?.exports?.A as any;
    const RunningGameStore = Object.values(wpRequire.c).find((x: any) => x?.exports?.Ay?.getRunningGames)?.exports?.Ay as any;
    const ChannelStore = Object.values(wpRequire.c).find((x: any) => x?.exports?.A?.__proto__?.getAllThreadsForParent)?.exports?.A as any;
    const GuildChannelStore = Object.values(wpRequire.c).find((x: any) => x?.exports?.Ay?.getSFWDefaultChannel)?.exports?.Ay as any;
    const FluxDispatcher = Object.values(wpRequire.c).find((x: any) => x?.exports?.h?.__proto__?.flushWaitQueue)?.exports?.h as any;
    const api = Object.values(wpRequire.c).find((x: any) => x?.exports?.Bo?.get)?.exports?.Bo as any;

    if (!api) {
        console.error("[QuestAutocomplete] Could not find API.");
        return;
    }

    const pid = Math.floor(Math.random() * 30000) + 1000;
    const applicationId = quest.config.application.id;
    const applicationName = quest.config.application.name;
    const questName = quest.config.messages.questName;
    const taskConfig = quest.config.taskConfig ?? quest.config.taskConfigV2;
    const taskName = supportedTasks.find(x => taskConfig.tasks[x] != null);

    if (!taskName) {
        console.error("[QuestAutocomplete] No supported task found for quest:", questName);
        return;
    }

    const secondsNeeded = taskConfig.tasks[taskName].target;
    let secondsDone = quest.userStatus?.progress?.[taskName]?.value ?? 0;
    const isApp = typeof DiscordNative !== "undefined";

    console.log(`[QuestAutocomplete] Starting autocomplete for "${questName}" (task: ${taskName})`);

    if (taskName === "WATCH_VIDEO" || taskName === "WATCH_VIDEO_ON_MOBILE") {
        const maxFuture = 10, speed = 7, interval = 1;
        const enrolledAt = new Date(quest.userStatus.enrolledAt).getTime();
        let completed = false;

        while (true) {
            const maxAllowed = Math.floor((Date.now() - enrolledAt) / 1000) + maxFuture;
            const diff = maxAllowed - secondsDone;
            const timestamp = secondsDone + speed;
            if (diff >= speed) {
                const res = await api.post({ url: `/quests/${quest.id}/video-progress`, body: { timestamp: Math.min(secondsNeeded, timestamp + Math.random()) } });
                completed = res.body.completed_at != null;
                secondsDone = Math.min(secondsNeeded, timestamp);
            }
            if (timestamp >= secondsNeeded) break;
            await new Promise(resolve => setTimeout(resolve, interval * 1000));
        }
        if (!completed) {
            await api.post({ url: `/quests/${quest.id}/video-progress`, body: { timestamp: secondsNeeded } });
        }
        console.log("[QuestAutocomplete] Quest completed!");
        Toasts.show({ message: `Quest "${questName}" completed!`, type: Toasts.Type.SUCCESS, id: Toasts.genId() });

    } else if (taskName === "PLAY_ON_DESKTOP") {
        if (!isApp) {
            Toasts.show({ message: "Use the Discord desktop app for this quest!", type: Toasts.Type.FAILURE, id: Toasts.genId() });
            return;
        }
        const res = await api.get({ url: `/applications/public?application_ids=${applicationId}` });
        const appData = res.body[0];
        const exeName = appData.executables?.find((x: any) => x.os === "win32")?.name?.replace(">", "") ?? appData.name.replace(/[\/\\:*?"<>|]/g, "");
        const fakeGame = {
            cmdLine: `C:\\Program Files\\${appData.name}\\${exeName}`,
            exeName,
            exePath: `c:/program files/${appData.name.toLowerCase()}/${exeName}`,
            hidden: false,
            isLauncher: false,
            id: applicationId,
            name: appData.name,
            pid,
            pidPath: [pid],
            processName: appData.name,
            start: Date.now(),
        };
        const realGames = RunningGameStore.getRunningGames();
        const fakeGames = [fakeGame];
        const realGetRunningGames = RunningGameStore.getRunningGames;
        const realGetGameForPID = RunningGameStore.getGameForPID;
        RunningGameStore.getRunningGames = () => fakeGames;
        RunningGameStore.getGameForPID = (pid: number) => fakeGames.find((x: any) => x.pid === pid);
        FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: realGames, added: [fakeGame], games: fakeGames });

        Toasts.show({ message: `Spoofed game to ${applicationName}. Wait ~${Math.ceil((secondsNeeded - secondsDone) / 60)} minutes.`, type: Toasts.Type.SUCCESS, id: Toasts.genId() });

        const fn = (data: any) => {
            const progress = quest.config.configVersion === 1 ? data.userStatus.streamProgressSeconds : Math.floor(data.userStatus.progress.PLAY_ON_DESKTOP.value);
            console.log(`[QuestAutocomplete] Progress: ${progress}/${secondsNeeded}`);
            if (progress >= secondsNeeded) {
                RunningGameStore.getRunningGames = realGetRunningGames;
                RunningGameStore.getGameForPID = realGetGameForPID;
                FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: [fakeGame], added: [], games: [] });
                FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);
                Toasts.show({ message: `Quest "${questName}" completed!`, type: Toasts.Type.SUCCESS, id: Toasts.genId() });
            }
        };
        FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);

    } else if (taskName === "STREAM_ON_DESKTOP") {
        if (!isApp) {
            Toasts.show({ message: "Use the Discord desktop app for this quest!", type: Toasts.Type.FAILURE, id: Toasts.genId() });
            return;
        }
        const realFunc = ApplicationStreamingStore.getStreamerActiveStreamMetadata;
        ApplicationStreamingStore.getStreamerActiveStreamMetadata = () => ({ id: applicationId, pid, sourceName: null });

        Toasts.show({ message: `Spoofed stream to ${applicationName}. Stream any window in VC for ~${Math.ceil((secondsNeeded - secondsDone) / 60)} minutes. Need 1+ person in VC!`, type: Toasts.Type.SUCCESS, id: Toasts.genId() });

        const fn = (data: any) => {
            const progress = quest.config.configVersion === 1 ? data.userStatus.streamProgressSeconds : Math.floor(data.userStatus.progress.STREAM_ON_DESKTOP.value);
            console.log(`[QuestAutocomplete] Progress: ${progress}/${secondsNeeded}`);
            if (progress >= secondsNeeded) {
                ApplicationStreamingStore.getStreamerActiveStreamMetadata = realFunc;
                FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);
                Toasts.show({ message: `Quest "${questName}" completed!`, type: Toasts.Type.SUCCESS, id: Toasts.genId() });
            }
        };
        FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", fn);

    } else if (taskName === "PLAY_ACTIVITY") {
        const channelId = ChannelStore.getSortedPrivateChannels()[0]?.id ?? Object.values(GuildChannelStore.getAllGuilds()).find((x: any) => x != null && x.VOCAL.length > 0)?.VOCAL[0].channel.id;
        const streamKey = `call:${channelId}:1`;

        while (true) {
            const res = await api.post({ url: `/quests/${quest.id}/heartbeat`, body: { stream_key: streamKey, terminal: false } });
            const progress = res.body.progress.PLAY_ACTIVITY.value;
            console.log(`[QuestAutocomplete] Progress: ${progress}/${secondsNeeded}`);
            await new Promise(resolve => setTimeout(resolve, 20 * 1000));
            if (progress >= secondsNeeded) {
                await api.post({ url: `/quests/${quest.id}/heartbeat`, body: { stream_key: streamKey, terminal: true } });
                break;
            }
        }
        Toasts.show({ message: `Quest "${questName}" completed!`, type: Toasts.Type.SUCCESS, id: Toasts.genId() });
    }
}

function canAutoComplete(quest: any): boolean {
    return !!(
        quest.userStatus?.enrolledAt &&
        !quest.userStatus?.completedAt &&
        new Date(quest.config.expiresAt).getTime() > Date.now() &&
        supportedTasks.find(y => Object.keys((quest.config.taskConfig ?? quest.config.taskConfigV2).tasks).includes(y))
    );
}

function QuestContextMenu(children: React.ReactNode[], props: { quest: any; }): void {
    if (!canAutoComplete(props.quest)) return;

    children.unshift(
        <Menu.MenuGroup>
            <Menu.MenuItem
                id="questautocomplete-start"
                label="⚡ Autocomplete Quest"
                action={() => autocompleteQuest(props.quest)}
            />
        </Menu.MenuGroup>
    );
}

export default definePlugin({
    name: "QuestAutocomplete",
    description: "Right-click any enrolled quest to autocomplete it automatically.",
    authors: [{ name: "You", id: 0n }],

    contextMenus: {
        "quests-entry": QuestContextMenu
    }
});
