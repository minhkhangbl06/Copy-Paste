import os

import mysql.connector
from flask import g


def db():
    if "db" not in g:
        options = {}
        if ca := os.environ.get("HOTEL_DB_SSL_CA"):
            options.update(ssl_ca=ca, ssl_verify_cert=True, ssl_verify_identity=True)
        g.db = mysql.connector.connect(
            host=os.environ.get("HOTEL_DB_HOST", "127.0.0.1"),
            port=int(os.environ.get("HOTEL_DB_PORT", "3306")),
            user=os.environ["HOTEL_DB_USER"],
            password=os.environ["HOTEL_DB_PASSWORD"],
            database="hotel_guest_service_v2",
            time_zone="+00:00",
            connection_timeout=5,
            autocommit=False,
            **options,
        )
    return g.db


def close_db(_error=None):
    connection = g.pop("db", None)
    if connection is not None:
        connection.close()


def execute(sql, params=()):
    with db().cursor() as cursor:
        cursor.execute(sql, params)
        return cursor.lastrowid, cursor.rowcount


def rows(sql, params=()):
    with db().cursor(dictionary=True) as cursor:
        cursor.execute(sql, params)
        return cursor.fetchall()


def one(sql, params=()):
    result = rows(sql, params)
    return result[0] if result else None
