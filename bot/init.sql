/* DATA MODEL FOR THE BOT */

DROP TABLE IF EXISTS posts, channels, sellers;

/* admins of channels */
CREATE TABLE sellers (username VARCHAR(255) PRIMARY KEY,
                     chat_id VARCHAR(255),
                     draft_title VARCHAR(255),
                     draft_description VARCHAR(3000),
                     draft_price VARCHAR(255) DEFAULT '[Not given]',
                     /* json encoded object of image ids {"collage": *, "watermarked": [*]} */
                     draft_image_ids VARCHAR(3000),
                     draft_channel VARCHAR(255),
                     /* the replied images album and photo message ids, so that they can be removed when posting */
                     preview_removed_message_ids VARCHAR(255),
                     preview_post_message_id VARCHAR(255),
                     draft_stage VARCHAR(255) /* where the admin is in the publishing of the post */
);

/* channels owned by admins, an admin can have more than one channel */
CREATE TABLE channels (username VARCHAR(255) PRIMARY KEY,
                       seller VARCHAR(255),
                       contact_text VARCHAR(255),
                       caption_template VARCHAR(1024) DEFAULT ':title\n\n:description\n\nPrice: :price',
                       sold_template VARCHAR(1024) DEFAULT '==== SOLD ===\n\n:caption\n\n===SOLD===',
                       license_expiry VARCHAR(255),
                       FOREIGN KEY (seller) REFERENCES sellers(username)
);

/* posts by the bot,
 message_id is in the form 'channel/message_id' because message_id's are only unique inside chats */
CREATE TABLE posts (message_id VARCHAR(255) PRIMARY KEY,
                    channel VARCHAR(255),
                    caption VARCHAR(3000),
                    /* json encoded list of image ids, the first is the collage */
                    image_ids VARCHAR(3000),
                    state VARCHAR(255) DEFAULT 'available',  /* or 'sold' */
                    FOREIGN KEY (channel) REFERENCES channels(username)
);

/* trigger for setting the default value for the contact text of channels */
CREATE TRIGGER default_contact_text BEFORE INSERT ON channels
    FOR EACH ROW
        SET NEW.contact_text =
            IF(NEW.contact_text IS NOT NULL,
               NEW.contact_text,
               CONCAT("To buy this item, contact @", NEW.seller, '.'));
