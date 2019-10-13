const {makeKeyboardTiles} = require('../utils')
const handleDoc = require('./document')

function settings(ctx) {
    if (ctx.state.isAdmin) {
        let stage = ctx.state.stage
        if (ctx.update.message) {
            if (ctx.update.message.text) {
                if (ctx.update.message.text === '/settings') {
                    handleSettings(ctx)
                } else {
                    handleSettingText(ctx)
                }
            } else if (ctx.update.message.document) {
                handleDoc(ctx)
            }
        } else if (ctx.update.callback_query) {
            if (stage === 'settings') {
                handleSettingIntro(ctx)
            } else {
                handleSettingChannel(ctx)
            }
        }
    } else {
        ctx.reply('You are not registered here as an admin of any channel.')
    }
}

async function handleSettings(ctx) {
    let username = ctx.from.username
    ctx.state.sql('UPDATE people SET conversation = "settings" WHERE username = ?', [username])
    let hasValidChannels = (await ctx.state.sql('SELECT c.license_expiry FROM channels as c INNER JOIN people AS p ON p.username = c.admin WHERE p.username = ?', [username])).some(l=>l.license_expiry*1 > ctx.update.message.date)
    if (hasValidChannels) {
        ctx.reply('What do you want to change?', {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Logo', callback_data: 'settings:logo' },],
                    [
                        { text: 'Caption template', callback_data: 'settings:caption_template' },
                        { text: 'Contact text', callback_data: 'settings:contact_text' }
                    ],
                    [
                        { text: 'Sold template', callback_data: 'settings:sold_template' },
                        { text: 'Description bullets', callback_data: 'settings:description_bullets' },
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
            let text = '<i>You will be changing the template of the text shown when the item is sold from</i> @'
                       + channel
                       + ', <i>here is the current template, you can edit anything except</i> <b>:caption</b>. <i>It is a placeholder for the caption.</i>\n\n'
                       + currentTemplate.replace(/:caption\b/, '<b>:caption</b>')
            return text
        }
    },
    contact_text: {
        next: 'settings.contact_text.text',
        text: async (ctx, channel) => {
            let currentText = (await ctx.state.sql('SELECT contact_text FROM channels WHERE username = ?', [channel]))[0].contact_text
            let text = '<i>You will be changing the text shown below the caption when a customer selects "Buy" from</i> @' + channel + ', <i>here is the current text. You can include additional info like phone numbers and so on.</i>\n\n' + currentText
            return text
        }
    },
    description_bullets: {
        next: 'settings.description_bullets.text',
        text: async (ctx, channel) => {
            let currentBullets = (await ctx.state.sql('SELECT description_bullets FROM channels WHERE username = ?', [channel]))[0].description_bullets
            let text = '<i>You will be changing the bullet point characters if you mostly list features of the item you post on</i> @' + channel + ', <i>here is the current one. Send a new phrase that you want to appear before every line of the description. If you want to make it empty, send</i> <b>none</b>\n\n' + currentBullets
            return text
        }
    }
}

const settingSpectficIntroParams = {
    logo: {
        text: 'Which channel\'s logo do you want to change?',
        next: 'settings:logo.'
    },
    caption_template: {
        text: 'Which channel\'s caption template do you want to change?',
        next: 'settings:caption_template.'
    },
    sold_template: {
        text: 'Which channel\'s sold template do you want to change?',
        next: 'settings:sold_template.'
    },
    contact_text: {
        text: 'Which channel\'s contact text do you want to change?',
        next: 'settings:contact_text.'
    },
    description_bullets: {
        text: 'Which channel\'s description bullets do you want to change?',
        next: 'settings:description_bullets'
    }
}


async function handleSettingIntro(ctx) {
    let username = ctx.from.username
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let type = ctx.update.callback_query.data
    let currentOne = settingSpectficIntroParams[type]
    ctx.state.sql('UPDATE people SET conversation = ? WHERE username = ?', [currentOne.next, username])
    let channels = (await ctx.state.sql('SELECT c.license_expiry, c.username FROM channels as c INNER JOIN people AS p ON p.username = c.admin WHERE p.username = ?', [username])).filter(l=>l.license_expiry*1 > ctx.update.callback_query.message.date).map(ch => ch.username)
    if (channels.length > 1) {
        let buttons = channels.map(ch => {return {text: '@' + ch, callback_data: currentOne.next + ch}})
        let keyboard = makeKeyboardTiles(buttons)
        let text = currentOne.text
        ctx.telegram.editMessageText(chatId, messageId, undefined, text, {
            reply_markup: {
                inline_keyboard: keyboard,
            }
        })
    } else if (channels.length === 1) { // auto select the first one and bypass the channel selection
        currentOne = settingSpectficChannelParams[type]
        let channel = channels[0]
        ctx.state.sql('UPDATE people SET settings_channel = ?, conversation = ? WHERE username = ?', [channel, currentOne.next, username])
        let text = await currentOne.text(ctx, channel)
        ctx.telegram.editMessageText(chatId, messageId, undefined, text, {parse_mode: 'html'})
    }
}

async function handleSettingChannel(ctx) {
    let username = ctx.from.username
    let [type, channel] = ctx.update.callback_query.data.split('.')
    let currentOne = settingSpectficChannelParams[type]
    ctx.state.sql('UPDATE people SET settings_channel = ?, conversation = ? WHERE username = ?', [channel, currentOne.next, username])
    let chatId = ctx.update.callback_query.from.id
    let messageId = ctx.update.callback_query.message.message_id
    let text = await currentOne.text(ctx, channel)
    ctx.telegram.editMessageText(chatId, messageId, undefined, text, {parse_mode: 'html'})
}

async function handleSettingText(ctx) {
    let stage = ctx.state.stage
    let username = ctx.from.username
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
    } else if (stage === 'settings.description_bullets.text') {
        let text = ctx.update.message.text
        let channel = (await ctx.state.sql('SELECT settings_channel FROM people WHERE username = ?', [username]))[0].settings_channel
        ctx.state.sql('UPDATE channels SET description_bullets = ? WHERE username = ?', [text, channel])
        ctx.state.sql('UPDATE people SET conversation = NULL WHERE username = ?', [username])
        ctx.reply('@' + channel + "'s description bullets has been updated. The new one will be shown the next time you post something.")
    }
}

module.exports = settings
