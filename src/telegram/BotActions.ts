import {ReplyMarkup} from "./api_types";
import {ChannelObject} from "@nodeguy/channel";
import {CallbackCommand, Command} from "./user_commands";


export namespace BotActions {
    interface BaseMessage {
        chat_id: number | string
        text: string
        parse_mode?: ReplyMarkup
        disable_web_page_preview?: boolean
    }

    interface BaseSendMessage extends BaseMessage {
        reply_id?: number
        disable_notification?: boolean
    }

    export interface SendMessage extends BaseSendMessage {
    }

    export interface SendChoices extends BaseSendMessage {
        choices: {
            buttons: MessageButton[][]
            channel: ChannelObject<CallbackCommand<any>>
        }
    }

    export interface EditMessage extends BaseMessage {
        message_id: number
        choices?: {
            buttons: MessageButton[][]
            channel: ChannelObject<CallbackCommand<any>>
        }
    }

    export interface EditChoices {
        chat_id: number | string
        message_id: number
        choices?: {
            buttons: MessageButton[][]
            channel: ChannelObject<CallbackCommand<any>>
        }
    }

    export interface AnswerCallbackQuery {
        query_id: string
        text?: string
        show_alert: boolean
    }
}

export function reply_command(command: Command) {
    return {chat_id: command.chat.id, reply_id: command.message_id};
}

export interface MessageButton {
    text: string
    data: any
}
