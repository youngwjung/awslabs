FROM python:3.8-alpine

WORKDIR /usr/src/app

RUN pip install --no-cache-dir -r requirements.txt
COPY app.py ./

EXPOSE 80
CMD [ "python", "./app.py" ] 