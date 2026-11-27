FROM nginx:1.29.3-alpine3.22
WORKDIR /

COPY ./temp_publish_docker/ /usr/share/nginx/html/

EXPOSE 80
