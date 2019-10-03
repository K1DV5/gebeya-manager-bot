drop table posts;

create table posts (id int primary key auto_increment, content varchar(255));
insert into posts (content) values ('the first one'), ('the second')
