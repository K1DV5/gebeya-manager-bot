/* DATA MODEL FOR THE BOT */

/* escape from the encoding abomination hell */
ALTER DATABASE my_gebeya CHARACTER SET = 'utf8mb4' COLLATE ='utf8mb4_unicode_ci';
SET NAMES utf8mb4;

DROP TABLE IF EXISTS posts, channels, people;

/* admins of channels */
CREATE TABLE people (username VARCHAR(255) PRIMARY KEY,
                     chat_id VARCHAR(255),
                     draft_title VARCHAR(255),
                     draft_description VARCHAR(3000),
                     draft_price VARCHAR(255) DEFAULT '[Not given]',
                     /* json encoded object of image ids {"collage": *, "watermarked": [*]} */
                     draft_image_ids VARCHAR(3000),
                     draft_destination VARCHAR(255), /* where the post will be (channel or channel/message_id) */
                     /* the replied images album and photo message ids, so that they can be removed when posting */
                     removed_message_ids VARCHAR(255),
                     preview_post_message_id VARCHAR(255),
                     settings_channel VARCHAR(255),
                     conversation VARCHAR(255) /* where the person is in the conversation */
);

/* channels owned by admins, an admin can have more than one channel */
CREATE TABLE channels (username VARCHAR(255) PRIMARY KEY,
                       admin VARCHAR(255),
                       contact_text VARCHAR(255),
                       caption_template VARCHAR(1024) DEFAULT ':title\n\n:description\n\nPrice: :price',
                       sold_template VARCHAR(1024) DEFAULT '===( SOLD )===\n\n:caption\n\n===( SOLD )===',
                       license_expiry VARCHAR(255),
                       description_bullets VARCHAR(12) DEFAULT 'none',
                       FOREIGN KEY (admin) REFERENCES people(username)
);

/* posts by the bot, */
CREATE TABLE posts (channel VARCHAR(255),
                    message_id VARCHAR(255),
                    title VARCHAR(255),
                    description VARCHAR(2440),
                    price VARCHAR(255),
                    caption VARCHAR(3000), /* the caption shown to the customer */
                    /* json encoded list of image ids, the first is the collage */
                    image_ids VARCHAR(3000),
                    post_date VARCHAR(128),
                    sold_date VARCHAR(128),
                    marked_sold INT DEFAULT 0,
                    state VARCHAR(255) DEFAULT 'available',  /* or 'sold' */
                    PRIMARY KEY (channel, message_id),
                    FOREIGN KEY (channel) REFERENCES channels(username)
);

/* trigger for setting the default value for the contact text of channels */
DELIMITER //
CREATE TRIGGER default_contact_text BEFORE INSERT ON channels FOR EACH ROW BEGIN
    IF (NEW.contact_text IS NULL) THEN
        SET NEW.contact_text = CONCAT("To buy this item, contact @", NEW.admin, '.');
    END IF;
END //
CREATE TRIGGER sale_count BEFORE UPDATE ON posts FOR EACH ROW BEGIN
    IF (NEW.state = 'sold') THEN
        SET NEW.marked_sold = OLD.marked_sold + 1;
    END IF;
END //
DELIMITER ;
/* insert into people (username) values('Ntsuhwork'); */
/* insert into channels (username, admin, license_expiry) values('mygeb', 'Ntsuhwork', '1572382800'); */
insert into people (username) values('K1DV5');
insert into channels (username, admin, license_expiry) values('mygeb', 'K1DV5', '1572382800');
/* insert into posts (channel, message_id, title) values ('mygeb', 45, 'foo'); */
/* select * from posts where channel = 'mygeb' AND message_id = 45; */
