/* -{mysql -u root k1dv5com_tg_gebeya < %f} */
/* DATA MODEL FOR THE BOT */

/* escape from the encoding abomination hell */
ALTER DATABASE k1dv5com_tg_gebeya CHARACTER SET = 'utf8mb4' COLLATE ='utf8mb4_unicode_ci';
SET NAMES utf8mb4;

DROP TABLE IF EXISTS notifications, channel_permissions, posts, channels, people;

/* admins of channels */
CREATE TABLE people (username VARCHAR(96) PRIMARY KEY,
                     chat_id VARCHAR(24),
                     draft_title VARCHAR(255),
                     draft_description VARCHAR(3000),
                     draft_price VARCHAR(255),
                     /* json encoded object of image ids {"collage": *, "watermarked": [*]} */
                     draft_image_ids VARCHAR(3000),
                     to_update VARCHAR(255), /* thing they are manipulating (post, channel) */
                     /* the replied images album and photo message ids, so that they can be removed when posting */
                     removed_message_ids VARCHAR(255), /* json list of message_ids to delete */
                     conversation VARCHAR(255) /* where the person is in the conversation */
) ENGINE = INNODB;

/* channels owned by admins, an admin can have more than one channel */
CREATE TABLE channels (username VARCHAR(96) PRIMARY KEY,
                       admin VARCHAR(96),
                       contact_text VARCHAR(255),
                       caption_template VARCHAR(1024) DEFAULT ':title\n\n:description\n\nPrice: :price',
                       sold_template VARCHAR(1024) DEFAULT '===( SOLD )===\n\n:caption\n\n===( SOLD )===',
                       license_expiry VARCHAR(255),
                       description_bullet VARCHAR(12) DEFAULT '•',
                       FOREIGN KEY (admin) REFERENCES people(username)
) ENGINE = INNODB;

/* posts by the bot, */
CREATE TABLE posts (channel VARCHAR(96),
                    message_id VARCHAR(96),
                    author VARCHAR(96),
                    title VARCHAR(255),
                    description VARCHAR(2440),
                    price VARCHAR(255),
                    caption VARCHAR(3000), /* the caption shown to the customer */
                    /* json encoded list of image ids, the first is the collage */
                    image_ids VARCHAR(3000),
                    post_date VARCHAR(128),
                    sold_date VARCHAR(128),
                    interested VARCHAR(3000) DEFAULT '[]', /* [{name: '', id: ''},...] - interested customers, max 21 */
                    state VARCHAR(255) DEFAULT 'available',  /* or 'sold' or 'deleted' */
                    PRIMARY KEY (channel, message_id),
                    FOREIGN KEY (channel) REFERENCES channels(username),
                    FOREIGN KEY (author) REFERENCES people(username)
) ENGINE = INNODB;

CREATE TABLE channel_permissions (
    person VARCHAR(96),
    channel VARCHAR(96),
    post BOOLEAN, /* post items */
    setting BOOLEAN, /* change settings */
    edit_others BOOLEAN, /* edit posts by other admins */
    delete_others BOOLEAN, /* delete posts by other admins */
    PRIMARY KEY (person, channel),
    FOREIGN KEY (channel) REFERENCES channels(username),
    FOREIGN KEY (person) REFERENCES people(username)
) ENGINE = INNODB;

CREATE TABLE notifications (
    person VARCHAR(96),
    channel VARCHAR(96),
    post_id VARCHAR(96),
    message_id VARCHAR(96),
    PRIMARY KEY (person, channel, post_id),
    FOREIGN KEY (person) REFERENCES people(username),
    FOREIGN KEY (channel, post_id) REFERENCES posts(channel, message_id)
) ENGINE = INNODB;

/* trigger for setting the default value for the contact text of channels */
DELIMITER //
CREATE TRIGGER default_contact_text BEFORE INSERT ON channels FOR EACH ROW BEGIN
    IF (NEW.contact_text IS NULL) THEN
        SET NEW.contact_text = CONCAT("To buy this item, contact @", NEW.admin, '.');
    END IF;
END //
DELIMITER ;
/* insert into people (username) values('Ntsuhwork'); */
/* insert into channels (username, admin, license_expiry) values('mygeb', 'Ntsuhwork', '1572382800'); */
insert into people (username) values('K1DV5');
insert into channels (username, admin, license_expiry) values('mygeb', 'K1DV5', '1577836800');
insert into channels (username, admin, license_expiry) values('mygebeyabags', 'K1DV5', '1577836800');
/* select * from people\G */
/* insert into channel_permissions (channel, person, post, setting) values('mygeb', 'K1DV5', true, 9) */
/* insert into posts (channel, message_id, title) values ('mygeb', 45, 'foo'); */
