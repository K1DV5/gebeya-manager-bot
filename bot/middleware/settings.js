const {makeKeyboardTiles} = require('../utils')

function settings(ctx) {
    if (ctx.state.isAdmin) {
        let stage = ctx.state.stage
        if (stage === 'settings') {
            handleSettingIntro(ctx)
        } else if (stage === 'settings.logo.channel') {
            handleSettingChannel(ctx)
        } else if (stage === 'settings.logo.document') {

        } else if (stage === 'settings.caption_template.channel') {
            handleSettingChannel(ctx)
        } else if (stage === 'settings.caption_template.text') {
            handleSettingText(ctx)
        } else if (stage === 'settings.sold_template.channel') {
            handleSettingChannel(ctx)
        } else if (stage === 'settings.sold_template.text') {
            handleSettingText(ctx)
        } else if (stage === 'settings.contact_text.channel') {
            handleSettingChannel(ctx)
        } else if (stage === 'settings.contact_text.text') {
            handleSettingText(ctx)
        } else {
            handleSettings(ctx)
        }
    } else {
        ctx.reply('You are not registered here as an admin of any channel.')
    }
}

async function handleSettings(ctx) {
    let username = ctx.from.username
    ctx.state.sql('UPDATE people SET conversation = "settings" WHERE username = ?', [username])
    let licences = (await ctx.state.sql('SELECT c.license_expiry FROM channels as c INNER JOIN people AS p ON p.username = c.admin WHERE p.username = ?', [username])).map(l=>l.license_expiry)
    if (licences.some(expire => expire > ctx.message.date)) {
        ctx.reply('What do you want to change?', {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Logo', callback_data: 'settings.logo:' },
                        { text: 'Contact text', callback_data: 'settings.contact_text:' }
                    ],
                    [
                        { text: 'Caption template', callback_data: 'settings.caption_template:' },
                        { text: 'Sold template', callback_data: 'settings.sold_template:' }
                    ]
                ]
            }
        })
    } else {
        ctx.reply('You have no channel with a valid license. Contact @' + ctx.state.admins[0] + ' for renewal.')
    }
}

const settingSpectficChannelParams = {
    logo: {
        next: 'settings.logo.document',
        text: (ctx, channel) => 'You will be changing the logo for @' + channel + ', send the logo AS A DOCUMENT because Telegam will remove the transparency if you send it as a photo.'
    },
    caption_template: {
        next: 'settings.caption_template.text',
        text: async (ctx, channel) => {
            let currentTemplate = (await ctx.state.sql('SELECT caption_template FROM channels WHERE username = ?', [channel]))[0].caption_template
                .replace(/:title\b/, '<b>:title</b>')
                .replace(/:description\b/, '<b>:description</b>')
                .replace(/:price\b/, '<b>:price</b>')
            let text = '<i>You will be changing the caption template for</i> @' + channel + ', <i>here is the current template, you can edit anything except</i> <b>:title</b>, <b>:description</b> <i>and</i> <b>:price</b>. <i>Those are placeholders for the posts.</i>\n\n' + currentTemplate
            return text
        }
    },
    sold_template: {
        next: 'settings.sold_template.text',
        text: async (ctx, channel) => {
            let currentTemplate = (await ctx.state.sql('SELECT sold_template FROM channels WHERE username = ?', [channel]))[0].sold_template
            let text = '<i>You will be changing the template of the text shown when the item is sold from</i> @' + channel + ', <i>here is the current template, you can edit anything except</i> <b>:caption</b>. <i>It is a placeholder for the caption.</i>\n\n' + currentTemplate
                .replace(/:caption\b/, '<b>:caption</b>')
            return text
        }
    },
    contact_text: {
        next: 'settings.sold_template.text',
        text: async (ctx, channel) => {
            let currentText = (await ctx.state.sql('SELECT contact_text FROM channels WHERE username = ?', [channel]))[0].contact_text
            let text = '<i>You will be changing the template of the text shown when the item is sold from</i> @' + channel + ', <i>here is the current template, you can edit anything except</i> <b>:caption</b>. <i>It is a placeholder for the caption.</i>\n\n' + currentText
            return text
        }
    }
}

const settingSpectficIntroParams = {
    logo: {
        text: 'Which channel\'s logo do you want to change?',
        next: 'settings.logo.channel'
    },
    caption_template: {
        text: 'Which channel\'s caption template do you want to change?',
        next: 'settings.caption_template.channel'
    },
    sold_template: {
        text: 'Which channel\'s sold template do you want to change?',
        next: 'settings.sold_template.channel'
    },
    contact_text: {
        text: 'Which channel\'s contact text do you want to change?',
        next: 'settings.contact_text.channel'
    }
}


async function handleSettingIntro(ctx) {
    let username = ctx.from.username
    let currentOne = settingSpectficIntroParams[ctx.state.stage.split('.')[1]]
    ctx.state.sql('UPDATE people SET conversation = ? WHERE username = ?', [currentOne.next, username])
    let channels = (await ctx.state.sql('SELECT c.username FROM channels as c INNER JOIN people AS p ON p.username = c.admin WHERE p.username = ?', [username])).map(ch => ch.username)
    let buttons = channels.map(ch => {return {text: '@' + ch, callback_data: currentOne.next.replace('.channel', '') + ':' + ch}})
    let keyboard = makeKeyboardTiles(buttons)
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let text = currentOne.text
    ctx.telegram.editMessageText(chatId, messageId, undefined, text, {
        reply_markup: {
            inline_keyboard: keyboard,
        }
    })
}

async function handleSettingChannel(ctx) {
    let username = ctx.from.username
    let channel = ctx.update.callback_query.data
    let currentOne = settingSpectficChannelParams[ctx.state.stage.split('.')[1]]
    ctx.state.sql('UPDATE people SET settings_channel = ?, conversation = ? WHERE username = ?', [channel, currentOne.next, username])
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let text = await currentOne.text(ctx, channel)
    ctx.telegram.editMessageText(chatId, messageId, undefined, text, {parse_mode: 'html'})
}

async function handleSettingText(ctx) {
    let stage = ctx.state.stage
    if (stage === 'settings.contact_text.text') {
        let text = ctx.update.message.text
        let channel = (await ctx.state.sql('SELECT settings_channel FROM people WHERE username = ?', [username]))[0].settings_channel
        ctx.state.sql('UPDATE channels SET contact_text = ? WHERE username = ?', [text, channel])
        ctx.state.sql('UPDATE people SET conversation = NULL WHERE username = ?', [username])
        ctx.reply('@' + channel + "'s contact text has been updated. The new one will be shown the next time a user selects an item.")
    } else if (stage === 'settings.caption_template.text') {
        let text = ctx.update.message.text
        if (/:title\b/.test(text) && /:description\b/.test(text) && /:price/.test(text)) {
            let channel = (await ctx.state.sql('SELECT settings_channel FROM people WHERE username = ?', [username]))[0].settings_channel
            ctx.state.sql('UPDATE channels SET caption_template = ? WHERE username = ?', [text, channel])
            ctx.state.sql('UPDATE people SET conversation = NULL WHERE username = ?', [username])
            ctx.reply('@' + channel + "'s caption template has been updated. This change will take effect from the next post on.")
        } else {
            ctx.reply('You have to include the above three elements, try again.')
        }
    } else if (stage === 'settings.sold_template.text') {
        let text = ctx.update.message.text
        if (/:caption\b/.test(text)) {
            let channel = (await ctx.state.sql('SELECT settings_channel FROM people WHERE username = ?', [username]))[0].settings_channel
            ctx.state.sql('UPDATE channels SET sold_template = ? WHERE username = ?', [text, channel])
            ctx.state.sql('UPDATE people SET conversation = NULL WHERE username = ?', [username])
            ctx.reply('@' + channel + "'s sold template has been updated. This change will take effect the next time an item is marked sold.")
        } else {
            ctx.reply('You have to include ":caption", try again.')
        }
    }
}

module.exports = settings
