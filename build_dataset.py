# -*- coding: utf-8 -*-
"""
Full Dataset Generator for 'ХимБиоРус ЕГЭ' 12-page Course Schedule.
Extracts all lessons, webinars, mocks, credits, attestations,
and generates companion blocks:
- For every Theory: companion "Тест" block in matching subject color
- For every Practice: companion "Письменное ДЗ" block in matching subject color
- For every Mock: companion "Тест" block
- For every Essay/Literature Review: companion "Тест" block
"""

import json
import os

def create_item(uid, title, subtitle="", subject="bio", category="theory", time=None, icon=None):
    return {
        "id": uid,
        "title": title,
        "subtitle": subtitle,
        "subject": subject,
        "category": category,
        "time": time,
        "icon": icon,
        "completed": False,
        "isCompanion": False
    }

def create_companion_test(parent_item):
    return {
        "id": f"comp-test-{parent_item['id']}",
        "title": f"Тест: {parent_item['title']}",
        "subtitle": parent_item.get("subtitle", "") or "Тестовый контроль знаний",
        "subject": parent_item["subject"],
        "category": "test",
        "time": None,
        "icon": None,
        "completed": False,
        "isCompanion": True,
        "parentId": parent_item["id"]
    }

def create_companion_hw(parent_item):
    return {
        "id": f"comp-hw-{parent_item['id']}",
        "title": f"Письменное ДЗ: {parent_item['title']}",
        "subtitle": parent_item.get("subtitle", "") or "Развернутые задания 2-й части",
        "subject": parent_item["subject"],
        "category": "homework",
        "time": None,
        "icon": None,
        "completed": False,
        "isCompanion": True,
        "parentId": parent_item["id"]
    }

def build_all_periods():
    periods = []

    # ==========================================
    # ПЕРИОД 1: 15 августа — 30 августа (Стр 1)
    # ==========================================
    p1_days = {
        "2026-08-10": {"dayName": "ПН", "dayNum": 10, "month": "авг", "items": []},
        "2026-08-11": {"dayName": "ВТ", "dayNum": 11, "month": "авг", "items": []},
        "2026-08-12": {"dayName": "СР", "dayNum": 12, "month": "авг", "items": []},
        "2026-08-13": {"dayName": "ЧТ", "dayNum": 13, "month": "авг", "items": []},
        "2026-08-14": {"dayName": "ПТ", "dayNum": 14, "month": "авг", "items": []},
        "2026-08-15": {"dayName": "СБ", "dayNum": 15, "month": "авг", "items": [
            create_item("p1_15_b1", "Вводный вебинар", "Старт курса", "bio", "webinar", icon="plus"),
            create_item("p1_15_b2", "Теория №1", "Введение в биологию №1, 22 задание (часть 1)", "bio", "theory"),
            create_item("p1_15_b3", "Пробник №1 (входной)", "Биология", "bio", "mock"),
            create_item("p1_15_c1", "Теория №1", "Введение в химию. Работа с ПТ. Строение атома.", "chem", "theory"),
            create_item("p1_15_c2", "Теория №2", "Электронные конфигурации.", "chem", "theory"),
            create_item("p1_15_c3", "Пробник №1 (входной)", "Химия", "chem", "mock"),
            create_item("p1_15_r1", "Теория №1", "Уроки по основам русского", "rus", "theory"),
            create_item("p1_15_r2", "Пробник №1 (входной)", "Русский язык", "rus", "mock"),
        ]},
        "2026-08-16": {"dayName": "ВС", "dayNum": 16, "month": "авг", "items": [
            create_item("p1_16_b1", "Организационный зачет №1", "до 30.08", "bio", "credit", icon="check"),
            create_item("p1_16_c1", "Вводный вебинар", "Старт курса", "chem", "webinar", icon="plus"),
            create_item("p1_16_c2", "Организационный зачет №1", "до 30.08", "chem", "credit", icon="check"),
            create_item("p1_16_r1", "Теория №2", "Сочинение ЕГЭ", "rus", "theory"),
        ]},
        "2026-08-17": {"dayName": "ПН", "dayNum": 17, "month": "авг", "items": [
            create_item("p1_17_r1", "Вводный вебинар", "Старт курса", "rus", "webinar", icon="plus"),
            create_item("p1_17_b1", "Теория №2", "Введение в биологию №2", "bio", "theory"),
        ]},
        "2026-08-18": {"dayName": "ВТ", "dayNum": 18, "month": "авг", "items": [
            create_item("p1_18_b1", "Практика №1", "Введение в биологию №1, 22 задание (часть 1)", "bio", "practice", time="16:00", icon="clock"),
            create_item("p1_18_r1", "Теория №3", "Итоговое сочинение", "rus", "theory"),
        ]},
        "2026-08-19": {"dayName": "СР", "dayNum": 19, "month": "авг", "items": [
            create_item("p1_19_c1", "Практика №1", "Введение в химию. Работа с ПТ. Строение атома.", "chem", "practice", time="16:00", icon="clock"),
        ]},
        "2026-08-20": {"dayName": "ЧТ", "dayNum": 20, "month": "авг", "items": [
            create_item("p1_20_b1", "Практика №2", "Введение в биологию №2", "bio", "practice", time="16:00", icon="clock"),
            create_item("p1_20_r1", "Теория №4", "4 задание", "rus", "theory"),
        ]},
        "2026-08-21": {"dayName": "ПТ", "dayNum": 21, "month": "авг", "items": [
            create_item("p1_21_c1", "Практика №2", "Электронные конфигурации.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p1_21_r1", "Разбор произведения №1", "«Герой нашего времени»", "rus", "review"),
        ]},
        "2026-08-22": {"dayName": "СБ", "dayNum": 22, "month": "авг", "items": [
            create_item("p1_22_b1", "Теория №3", "22 задание (часть 2)", "bio", "theory"),
            create_item("p1_22_c1", "Теория №3", "Электронные конфигурации. Продолжение.", "chem", "theory"),
            create_item("p1_22_c2", "Теория №4", "Химические связи. Кристаллические решётки.", "chem", "theory"),
            create_item("p1_22_r1", "Теория №5", "5 задание", "rus", "theory"),
        ]},
        "2026-08-23": {"dayName": "ВС", "dayNum": 23, "month": "авг", "items": [
            create_item("p1_23_c1", "Клуб укротителей задач №1", "Вся математика для химиков (часть 1).", "chem", "webinar", icon="plus"),
        ]},
        "2026-08-24": {"dayName": "ПН", "dayNum": 24, "month": "авг", "items": [
            create_item("p1_24_b1", "Теория №4", "Биохимия клетки №1", "bio", "theory"),
            create_item("p1_24_r1", "Разбор произведения №2", "«Капитанская дочка»", "rus", "review"),
        ]},
        "2026-08-25": {"dayName": "ВТ", "dayNum": 25, "month": "авг", "items": [
            create_item("p1_25_b1", "Практика №3", "22 задание (часть 2)", "bio", "practice", time="16:00", icon="clock"),
            create_item("p1_25_r1", "Теория №6", "6 задание", "rus", "theory"),
        ]},
        "2026-08-26": {"dayName": "СР", "dayNum": 26, "month": "авг", "items": [
            create_item("p1_26_c1", "Практика №3", "Электронные конфигурации. Продолжение.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p1_26_r1", "Разбор произведения №3", "«Отцы и дети»", "rus", "review"),
        ]},
        "2026-08-27": {"dayName": "ЧТ", "dayNum": 27, "month": "авг", "items": [
            create_item("p1_27_b1", "Практика №4", "Биохимия клетки №1", "bio", "practice", time="16:00", icon="clock"),
            create_item("p1_27_r1", "Теория №7", "7 задание", "rus", "theory"),
        ]},
        "2026-08-28": {"dayName": "ПТ", "dayNum": 28, "month": "авг", "items": [
            create_item("p1_28_c1", "Практика №4", "Химические связи. Кристаллические решётки.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p1_28_r1", "Разбор произведения №4", "«Преступление и наказание»", "rus", "review"),
        ]},
        "2026-08-29": {"dayName": "СБ", "dayNum": 29, "month": "авг", "items": [
            create_item("p1_29_r1", "Практика №1", "Сочинение ЕГЭ: мифы и реальность. Типы текстов / Веб с экспертом ЕГЭ", "rus", "practice", time="16:00", icon="clock"),
            create_item("p1_29_b1", "Теория №5", "Биохимия клетки №2", "bio", "theory"),
            create_item("p1_29_c1", "Теория №5", "Степень окисления.", "chem", "theory"),
            create_item("p1_29_c2", "Теория №6", "Номенклатура бинарных соединений. Валентность. Структурные формулы.", "chem", "theory"),
        ]},
        "2026-08-30": {"dayName": "ВС", "dayNum": 30, "month": "авг", "items": [
            create_item("p1_30_c1", "Клуб укротителей задач №2", "Вся математика для химиков (часть 2).", "chem", "webinar", icon="plus"),
        ]}
    }
    periods.append({"id": "p01", "name": "15 августа — 30 августа", "days": p1_days})

    # ==========================================
    # ПЕРИОД 2: 31 августа — 20 сентября (Стр 2)
    # ==========================================
    p2_days = {
        "2026-08-31": {"dayName": "ПН", "dayNum": 31, "month": "авг", "items": [
            create_item("p2_31_r1", "Практика №2", "Итоговое сочинение + читаем рассказ Base", "rus", "practice", time="16:00", icon="clock"),
            create_item("p2_31_b1", "Теория №6", "Строение клетки №1", "bio", "theory"),
            create_item("p2_31_c1", "Пробник №2", "Химия", "chem", "mock"),
        ]},
        "2026-09-01": {"dayName": "ВТ", "dayNum": 1, "month": "сен", "items": [
            create_item("p2_01_b1", "Практика №5", "Биохимия клетки №2", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-09-02": {"dayName": "СР", "dayNum": 2, "month": "сен", "items": [
            create_item("p2_02_c1", "Практика №5", "Степень окисления.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p2_02_r1", "Разбор произведения №5", "«Гроза»", "rus", "review"),
            create_item("p2_02_r2", "Тест №1", "Русский язык", "rus", "test"),
        ]},
        "2026-09-03": {"dayName": "ЧТ", "dayNum": 3, "month": "сен", "items": [
            create_item("p2_03_b1", "Практика №6", "Строение клетки №1", "bio", "practice", time="16:00", icon="clock"),
            create_item("p2_03_r1", "Теория №8", "8 задание", "rus", "theory"),
        ]},
        "2026-09-04": {"dayName": "ПТ", "dayNum": 4, "month": "сен", "items": [
            create_item("p2_04_c1", "Практика №6", "Номенклатура бинарных соединений. Валентность. Структурные формулы.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p2_04_r1", "Разбор произведения №6", "Судьба человека", "rus", "review"),
        ]},
        "2026-09-05": {"dayName": "СБ", "dayNum": 5, "month": "сен", "items": [
            create_item("p2_05_b1", "Разбор входного пробника с Асифом", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p2_05_b2", "Теория №7", "Строение клетки №2", "bio", "theory"),
            create_item("p2_05_c1", "Теория №7", "Чистые вещества и смеси. Растворы. Массовая доля. Задача 26.", "chem", "theory"),
            create_item("p2_05_c2", "Теория №8", "Классификация и номенклатура неорганических соединений.", "chem", "theory"),
        ]},
        "2026-09-06": {"dayName": "ВС", "dayNum": 6, "month": "сен", "items": []},

        "2026-09-07": {"dayName": "ПН", "dayNum": 7, "month": "сен", "items": [
            create_item("p2_07_r1", "Практика №3", "Сочинение ЕГЭ. Нетиповый вебчик", "rus", "practice", time="16:00", icon="clock"),
            create_item("p2_07_b1", "Теория №8", "Метаболизм №1", "bio", "theory"),
        ]},
        "2026-09-08": {"dayName": "ВТ", "dayNum": 8, "month": "сен", "items": [
            create_item("p2_08_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 8.09 ДО 14.09", "general", "payment"),
            create_item("p2_08_b1", "Практика №7", "Строение клетки №2", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-09-09": {"dayName": "СР", "dayNum": 9, "month": "сен", "items": [
            create_item("p2_09_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 8.09 ДО 14.09", "general", "payment"),
            create_item("p2_09_c1", "Практика №7", "Чистые вещества и смеси. Растворы. Виды растворов. Массовая доля. Задача 26.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p2_09_b1", "Пробник №2", "Биология", "bio", "mock"),
            create_item("p2_09_r1", "Разбор произведения №7", "«Портрет Дориана Грея»", "rus", "review"),
        ]},
        "2026-10-10": {"dayName": "ЧТ", "dayNum": 10, "month": "сен", "items": [
            create_item("p2_10_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 8.09 ДО 14.09", "general", "payment"),
            create_item("p2_10_b1", "Практика №8", "Метаболизм №1", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-09-11": {"dayName": "ПТ", "dayNum": 11, "month": "сен", "items": [
            create_item("p2_11_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 8.09 ДО 14.09", "general", "payment"),
            create_item("p2_11_c1", "Практика №8", "Классификация и номенклатура неорганических соединений.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p2_11_r1", "Разбор произведения №8", "«Пиковая дама»", "rus", "review"),
        ]},
        "2026-09-12": {"dayName": "СБ", "dayNum": 12, "month": "сен", "items": [
            create_item("p2_12_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 8.09 ДО 14.09", "general", "payment"),
            create_item("p2_12_r1", "Практика №4", "Жёсткая нарешка заданий 4-8. Сложные тексты ЕГЭ / Веб с экспертом ЕГЭ", "rus", "practice", time="16:00", icon="clock"),
            create_item("p2_12_b1", "Теория №9", "Метаболизм №2", "bio", "theory"),
            create_item("p2_12_c1", "Теория №9", "Периодический закон.", "chem", "theory"),
            create_item("p2_12_c2", "Теория №10", "Химическая реакция. Уравнение химической реакции. Классификация реакций. Скорость реакций.", "chem", "theory"),
        ]},
        "2026-09-13": {"dayName": "ВС", "dayNum": 13, "month": "сен", "items": [
            create_item("p2_13_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 8.09 ДО 14.09", "general", "payment"),
            create_item("p2_13_c1", "Онлайн-разбор пробника №2", "Химия", "chem", "webinar", icon="plus"),
        ]},

        "2026-09-14": {"dayName": "ПН", "dayNum": 14, "month": "сен", "items": [
            create_item("p2_14_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 8.09 ДО 14.09", "general", "payment"),
            create_item("p2_14_r1", "Практика №5", "Праздничное решение варианта + Посвящение в НОО. Нетиповый вебчик", "rus", "practice", time="16:00", icon="clock"),
            create_item("p2_14_b1", "Теория №10", "Матричные реакции №1", "bio", "theory"),
            create_item("p2_14_c1", "Пробник №3", "Химия", "chem", "mock"),
        ]},
        "2026-09-15": {"dayName": "ВТ", "dayNum": 15, "month": "сен", "items": [
            create_item("p2_15_b1", "Практика №9", "Метаболизм №2", "bio", "practice", time="16:00", icon="clock"),
            create_item("p2_15_r1", "Пробник №2", "Русский язык", "rus", "mock"),
        ]},
        "2026-09-16": {"dayName": "СР", "dayNum": 16, "month": "сен", "items": [
            create_item("p2_16_c1", "Практика №9", "Периодический закон.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p2_16_r1", "Теория №9", "Сочинение ЕГЭ: авторская позиция, комментарий", "rus", "theory"),
        ]},
        "2026-09-17": {"dayName": "ЧТ", "dayNum": 17, "month": "сен", "items": [
            create_item("p2_17_b1", "Практика №10", "Матричные реакции №1", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-09-18": {"dayName": "ПТ", "dayNum": 18, "month": "сен", "items": [
            create_item("p2_18_c1", "Практика №10", "Химическая реакция. Уравнение химической реакции. Классификация реакций. Скорость реакций.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p2_18_r1", "Теория №10", "Сочинение ЕГЭ: уроки по связям", "rus", "theory"),
        ]},
        "2026-09-19": {"dayName": "СБ", "dayNum": 19, "month": "сен", "items": [
            create_item("p2_19_b1", "Эвристика с Аленой", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p2_19_b2", "Теория №11", "Матричные реакции №2", "bio", "theory"),
            create_item("p2_19_c1", "Теория №11", "Формулы в химии. Расчёты по уравнению реакции. Простейшие задачи.", "chem", "theory"),
            create_item("p2_19_c2", "Теория №12", "Основы ОВР. Электронный баланс.", "chem", "theory"),
            create_item("p2_19_r1", "Теория №11", "Сочинение ЕГЭ: своя позиция", "rus", "theory"),
        ]},
        "2026-09-20": {"dayName": "ВС", "dayNum": 20, "month": "сен", "items": []}
    }
    periods.append({"id": "p02", "name": "31 августа — 20 сентября", "days": p2_days})

    # ==========================================
    # ПЕРИОД 3: 21 сентября — 11 октября (Стр 3)
    # ==========================================
    p3_days = {
        "2026-09-21": {"dayName": "ПН", "dayNum": 21, "month": "сен", "items": [
            create_item("p3_21_r1", "Практика №6", "Сочинение ЕГЭ Комментарим", "rus", "practice", time="16:00", icon="clock"),
        ]},
        "2026-09-22": {"dayName": "ВТ", "dayNum": 22, "month": "сен", "items": [
            create_item("p3_22_b1", "Практика №11.1", "Решение задач на биосинтез белка №1", "bio", "practice", time="16:00", icon="clock"),
            create_item("p3_22_r1", "Теория №12", "4 задание", "rus", "theory"),
        ]},
        "2026-09-23": {"dayName": "СР", "dayNum": 23, "month": "сен", "items": [
            create_item("p3_23_c1", "Практика №11", "Формулы в химии. Расчёты по уравнению реакции. Простейшие задачи.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p3_23_b1", "Пробник №3", "Биология", "bio", "mock"),
        ]},
        "2026-09-24": {"dayName": "ЧТ", "dayNum": 24, "month": "сен", "items": [
            create_item("p3_24_b1", "Практика №11.2", "Решение задач на биосинтез белка №2", "bio", "practice", time="16:00", icon="clock"),
            create_item("p3_24_r1", "Теория №13", "5 задание", "rus", "theory"),
        ]},
        "2026-09-25": {"dayName": "ПТ", "dayNum": 25, "month": "сен", "items": [
            create_item("p3_25_c1", "Практика №12", "Основы ОВР. Электронный баланс.", "chem", "practice", time="16:00", icon="clock"),
        ]},
        "2026-09-26": {"dayName": "СБ", "dayNum": 26, "month": "сен", "items": [
            create_item("p3_26_b1", "Разбор пробника №2 с Асифом", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p3_26_c1", "Теория №13", "Химические свойства оксидов: основных и кислотных.", "chem", "theory"),
            create_item("p3_26_c2", "Теория №14", "Химические свойства оснований.", "chem", "theory"),
            create_item("p3_26_r1", "Практика №7", "К1-К3 на максимум. Разбор работ. Веб с экспертом ЕГЭ", "rus", "practice"),
            create_item("p3_26_r2", "Теория №14", "6 задание", "rus", "theory"),
        ]},
        "2026-09-27": {"dayName": "ВС", "dayNum": 27, "month": "сен", "items": [
            create_item("p3_27_c1", "Клуб укротителей задач №3", "Задача 26. Молярные концентрации.", "chem", "webinar", icon="plus"),
        ]},

        "2026-09-28": {"dayName": "ПН", "dayNum": 28, "month": "сен", "items": [
            create_item("p3_28_b1", "Теория №12", "Деление клетки №1", "bio", "theory"),
            create_item("p3_28_c1", "Пробник №4", "Химия", "chem", "mock"),
            create_item("p3_28_r1", "Теория №15", "7 задание", "rus", "theory"),
        ]},
        "2026-09-29": {"dayName": "ВТ", "dayNum": 29, "month": "сен", "items": [
            create_item("p3_29_b1", "Практика №11.3", "Решение задач на биосинтез белка №3", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-09-30": {"dayName": "СР", "dayNum": 30, "month": "сен", "items": [
            create_item("p3_30_c1", "Практика №13", "Химические свойства оксидов: основных и кислотных.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p3_30_r1", "Теория №16", "8 задание", "rus", "theory"),
        ]},
        "2026-10-01": {"dayName": "ЧТ", "dayNum": 1, "month": "окт", "items": [
            create_item("p3_01_b1", "Практика №12", "Деление клетки №1", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-10-02": {"dayName": "ПТ", "dayNum": 2, "month": "окт", "items": [
            create_item("p3_02_c1", "Практика №14", "Химические свойства оснований.", "chem", "practice"),
            create_item("p3_02_b1", "Зачёт №2 (до 11.10)", "Биология", "bio", "credit", icon="check"),
            create_item("p3_02_r1", "Тест №2", "Русский язык", "rus", "test"),
        ]},
        "2026-10-03": {"dayName": "СБ", "dayNum": 3, "month": "окт", "items": [
            create_item("p3_03_b1", "Эвристика с Аленой", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p3_03_b2", "Теория №13", "Деление клетки №2", "bio", "theory"),
            create_item("p3_03_c1", "Теория №15", "Химические свойства кислот. Кислоты-окислители.", "chem", "theory"),
            create_item("p3_03_c2", "Теория №16", "Выход реакции. Примеси. Задача 28.", "chem", "theory"),
            create_item("p3_03_r1", "Теория №17", "22 задание", "rus", "theory"),
        ]},
        "2026-10-04": {"dayName": "ВС", "dayNum": 4, "month": "окт", "items": [
            create_item("p3_04_c1", "Клуб укротителей задач №4", "Формулы в химии. Дополнительная отработка.", "chem", "webinar", icon="plus"),
        ]},

        "2026-10-05": {"dayName": "ПН", "dayNum": 5, "month": "окт", "items": [
            create_item("p3_05_r1", "Практика №8", "МЕГАВЕБИНАР по заданиям 4-8, 22. Русская рулетка", "rus", "practice", time="16:00", icon="clock"),
            create_item("p3_05_b1", "Теория №14", "Гаметогенез, Размножение", "bio", "theory"),
        ]},
        "2026-10-06": {"dayName": "ВТ", "dayNum": 6, "month": "окт", "items": [
            create_item("p3_06_b1", "Практика №13", "Деление клетки №2", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-10-07": {"dayName": "СР", "dayNum": 7, "month": "окт", "items": [
            create_item("p3_07_c1", "Практика №15", "Химические свойства кислот. Кислоты-окислители.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p3_07_b1", "Пробник №4", "Биология", "bio", "mock"),
            create_item("p3_07_r1", "Теория №18", "9 задание", "rus", "theory"),
            create_item("p3_07_r2", "Разбор произведения №9", "«Обломов»", "rus", "review"),
        ]},
        "2026-10-08": {"dayName": "ЧТ", "dayNum": 8, "month": "окт", "items": [
            create_item("p3_08_b1", "Практика №14", "Гаметогенез, Размножение", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-10-09": {"dayName": "ПТ", "dayNum": 9, "month": "окт", "items": [
            create_item("p3_09_c1", "Практика №16", "Выход реакции. Примеси. Задача 28.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p3_09_r1", "Теория №19", "10 задание", "rus", "theory"),
        ]},
        "2026-10-10": {"dayName": "СБ", "dayNum": 10, "month": "окт", "items": [
            create_item("p3_10_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.10 ДО 14.10", "general", "payment"),
            create_item("p3_10_b1", "Разбор пробника №3 с Асифом", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p3_10_r1", "Практика №9", "Жёсткая нарешка заданий 4-8. К9 на максимум. Веб с экспертом ЕГЭ", "rus", "practice", time="16:00", icon="clock"),
            create_item("p3_10_b2", "Теория №15", "Онтогенез", "bio", "theory"),
            create_item("p3_10_c1", "Теория №17", "Амфотерность. Химические свойства амфотерных оксидов и гидроксидов.", "chem", "theory"),
            create_item("p3_10_c2", "Теория №18", "Химические свойства средних солей.", "chem", "theory"),
        ]},
        "2026-10-11": {"dayName": "ВС", "dayNum": 11, "month": "окт", "items": [
            create_item("p3_11_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.10 ДО 14.10", "general", "payment"),
            create_item("p3_11_c1", "Онлайн-разбор пробника №4", "Химия", "chem", "webinar", icon="plus"),
        ]}
    }
    periods.append({"id": "p03", "name": "21 сентября — 11 октября", "days": p3_days})

    # ==========================================
    # ПЕРИОД 4: 12 октября — 1 ноября (Стр 4)
    # ==========================================
    p4_days = {
        "2026-10-12": {"dayName": "ПН", "dayNum": 12, "month": "окт", "items": [
            create_item("p4_12_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.10 ДО 14.10", "general", "payment"),
            create_item("p4_12_r1", "Практика №10", "Сочинение ЕГЭ + 9 и 10 задания. Нетиповый вебчик", "rus", "practice", time="16:00", icon="clock"),
            create_item("p4_12_b1", "Теория №16", "Бактерии и вирусы", "bio", "theory"),
            create_item("p4_12_c1", "Пробник №5", "Химия", "chem", "mock"),
        ]},
        "2026-10-13": {"dayName": "ВТ", "dayNum": 13, "month": "окт", "items": [
            create_item("p4_13_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.10 ДО 14.10", "general", "payment"),
            create_item("p4_13_b1", "Практика №15", "Онтогенез", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-10-14": {"dayName": "СР", "dayNum": 14, "month": "окт", "items": [
            create_item("p4_14_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.10 ДО 14.10", "general", "payment"),
            create_item("p4_14_c1", "Практика №17", "Амфотерность. Химические свойства амфотерных оксидов и гидроксидов.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p4_14_r1", "Теория №20", "11 задание (часть 1)", "rus", "theory"),
            create_item("p4_14_r2", "Разбор произведения №10", "«Юшка»", "rus", "review"),
        ]},
        "2026-10-15": {"dayName": "ЧТ", "dayNum": 15, "month": "окт", "items": [
            create_item("p4_15_b1", "Практика №16", "Бактерии и вирусы", "bio", "practice", time="16:00", icon="clock"),
            create_item("p4_15_b2", "Пробник №3", "Биология", "bio", "mock"),
        ]},
        "2026-10-16": {"dayName": "ПТ", "dayNum": 16, "month": "окт", "items": [
            create_item("p4_16_c1", "Практика №18", "Химические свойства средних солей.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p4_16_r1", "Теория №21", "11 задание (часть 2)", "rus", "theory"),
        ]},
        "2026-10-17": {"dayName": "СБ", "dayNum": 17, "month": "окт", "items": [
            create_item("p4_17_b1", "Эвристика с Аленой", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p4_17_b2", "Теория №17", "Грибы и лишайники", "bio", "theory"),
            create_item("p4_17_c1", "Зачет №2 до 25.10", "Химия", "chem", "credit", icon="check"),
            create_item("p4_17_c2", "Теория №19", "Химические свойства кислых, основных и комплексных солей.", "chem", "theory"),
            create_item("p4_17_c3", "Теория №20", "Задача 23. Задача 27.", "chem", "theory"),
        ]},
        "2026-10-18": {"dayName": "ВС", "dayNum": 18, "month": "окт", "items": [
            create_item("p4_18_c1", "Клуб укротителей задач №5", "Задача 28. Дополнительная отработка.", "chem", "webinar", icon="plus"),
        ]},

        "2026-10-19": {"dayName": "ПН", "dayNum": 19, "month": "окт", "items": [
            create_item("p4_19_r1", "Практика №11", "Итоговое сочинение + читаем рассказы Base", "rus", "practice", time="16:00", icon="clock"),
            create_item("p4_19_b1", "Теория №18", "Основы и методы генетики, Изменчивость, Наследственные заболевания человека", "bio", "theory"),
        ]},
        "2026-10-20": {"dayName": "ВТ", "dayNum": 20, "month": "окт", "items": [
            create_item("p4_20_b1", "Практика №17", "Грибы и лишайники", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-10-21": {"dayName": "СР", "dayNum": 21, "month": "окт", "items": [
            create_item("p4_21_c1", "Практика №19", "Химические свойства кислых, основных и комплексных солей.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p4_21_b1", "Пробник №5", "Биология", "bio", "mock"),
            create_item("p4_21_r1", "Теория №22", "12 задание", "rus", "theory"),
            create_item("p4_21_r2", "Разбор произведения №11", "«Старуха Изергиль»", "rus", "review"),
        ]},
        "2026-10-22": {"dayName": "ЧТ", "dayNum": 22, "month": "окт", "items": [
            create_item("p4_22_b1", "Практика №18", "Основы и методы генетики, Изменчивость, Наследственные заболевания человека", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-10-23": {"dayName": "ПТ", "dayNum": 23, "month": "окт", "items": [
            create_item("p4_23_c1", "Практика №20", "Задача 23. Задача 27.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p4_23_r1", "Теория №23", "13 задание", "rus", "theory"),
        ]},
        "2026-10-24": {"dayName": "СБ", "dayNum": 24, "month": "окт", "items": [
            create_item("p4_24_b1", "Разбор пробника №4 с Асифом", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p4_24_r1", "Практика №12", "Жёсткая нарешка заданий 9-13. К7 на максимум. Веб с экспертом ЕГЭ", "rus", "practice", time="16:00", icon="clock"),
            create_item("p4_24_b2", "Теория №19", "Законы Менделя, Типы скрещиваний", "bio", "theory"),
            create_item("p4_24_c1", "Теория №21", "ТЭД. РИО. Признаки реакций.", "chem", "theory"),
            create_item("p4_24_c2", "Теория №22", "Гидролиз солей. Необратимый гидролиз бинарных соединений.", "chem", "theory"),
        ]},
        "2026-10-25": {"dayName": "ВС", "dayNum": 25, "month": "окт", "items": []},

        "2026-10-26": {"dayName": "ПН", "dayNum": 26, "month": "окт", "items": [
            create_item("p4_26_b1", "Теория №20", "Взаимодействие аллельных генов, Летальный ген", "bio", "theory"),
            create_item("p4_26_c1", "Пробник №6", "Химия", "chem", "mock"),
            create_item("p4_26_r1", "Практика №13", "Сочинение ЕГЭ + задания 9-13. Нетиповый вебчик", "rus", "practice"),
            create_item("p4_26_r2", "Зачетный диктант №1", "Русский язык", "rus", "credit", icon="check"),
        ]},
        "2026-10-27": {"dayName": "ВТ", "dayNum": 27, "month": "окт", "items": [
            create_item("p4_27_b1", "Практика №19", "Законы Менделя, Типы скрещиваний", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-10-28": {"dayName": "СР", "dayNum": 28, "month": "окт", "items": [
            create_item("p4_28_c1", "Практика №21", "ТЭД. РИО. Признаки реакций.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p4_28_r1", "Теория №24", "14 задание (часть 1)", "rus", "theory"),
            create_item("p4_28_r2", "Разбор произведения №12", "«Вишнёвый сад»", "rus", "review"),
        ]},
        "2026-10-29": {"dayName": "ЧТ", "dayNum": 29, "month": "окт", "items": [
            create_item("p4_29_b1", "Практика №20", "Взаимодействие аллельных генов, Летальный ген", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-10-30": {"dayName": "ПТ", "dayNum": 30, "month": "окт", "items": [
            create_item("p4_30_c1", "Практика №22", "Гидролиз солей. Необратимый гидролиз бинарных соединений.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p4_30_r1", "Теория №25", "14 задание (часть 2)", "rus", "theory"),
        ]},
        "2026-10-31": {"dayName": "СБ", "dayNum": 31, "month": "окт", "items": [
            create_item("p4_31_b1", "Эвристика с Аленой", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p4_31_b2", "Теория №21", "Популяционная генетика, Закон генетического равновесия Харди-Вайнберга", "bio", "theory"),
            create_item("p4_31_c1", "Теория №23", "Электролиз.", "chem", "theory"),
            create_item("p4_31_c2", "Теория №24", "Задача 34.1. Введение в 34 задачу. Избыток и недостаток. Расчёты по нескольким реакциям.", "chem", "theory"),
        ]},
        "2026-11-01": {"dayName": "ВС", "dayNum": 1, "month": "ноя", "items": [
            create_item("p4_01_c1", "Клуб укротителей задач №6", "Усложнённые задачи 23 и 27.", "chem", "webinar", icon="plus"),
        ]}
    }
    periods.append({"id": "p04", "name": "12 октября — 1 ноября", "days": p4_days})

    # ==========================================
    # ПЕРИОД 5: 2 ноября — 22 ноября (Стр 5)
    # ==========================================
    p5_days = {
        "2026-11-02": {"dayName": "ПН", "dayNum": 2, "month": "ноя", "items": [
            create_item("p5_02_b1", "Теория №22", "Сцепленное наследование признаков", "bio", "theory"),
            create_item("p5_02_r1", "Практика №14", "Итоговое сочинение + задания 9-14. Нетиповый вебчик", "rus", "practice"),
            create_item("p5_02_r2", "Тест №3", "Русский язык", "rus", "test"),
        ]},
        "2026-11-03": {"dayName": "ВТ", "dayNum": 3, "month": "ноя", "items": [
            create_item("p5_03_b1", "Практика №21", "Популяционная генетика, Закон генетического равновесия Харди-Вайнберга", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-11-04": {"dayName": "СР", "dayNum": 4, "month": "ноя", "items": [
            create_item("p5_04_c1", "Практика №23", "Электролиз.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p5_04_b1", "Пробник №6", "Биология", "bio", "mock"),
            create_item("p5_04_r1", "Теория №26", "15 задание", "rus", "theory"),
            create_item("p5_04_r2", "Разбор произведения №13", "«Мы»", "rus", "review"),
        ]},
        "2026-11-05": {"dayName": "ЧТ", "dayNum": 5, "month": "ноя", "items": [
            create_item("p5_05_b1", "Практика №22", "Сцепленное наследование признаков", "bio", "practice", time="16:00", icon="clock"),
            create_item("p5_05_r1", "Рубежная аттестация №1", "Сочинение ЕГЭ и ИС + Культура речи и Орфография до 12.11", "rus", "attestation", icon="alert"),
        ]},
        "2026-11-06": {"dayName": "ПТ", "dayNum": 6, "month": "ноя", "items": [
            create_item("p5_06_c1", "Практика №24", "Задача 34.1. Введение в 34 задачу. Избыток и недостаток. Расчёты по нескольким реакциям.", "chem", "practice", time="16:00", icon="clock"),
        ]},
        "2026-11-07": {"dayName": "СБ", "dayNum": 7, "month": "ноя", "items": [
            create_item("p5_07_b1", "Разбор пробника №5 с Асифом", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p5_07_r1", "Практика №15", "Жёсткая нарешка заданий 14-15. Пишем сочинение. Веб с экспертом ЕГЭ", "rus", "practice", time="16:00", icon="clock"),
            create_item("p5_07_b2", "Теория №23", "Генетика пола, Сцепленное с полом наследование, Родословные", "bio", "theory"),
            create_item("p5_07_c1", "Теория №25", "Химическое равновесие.", "chem", "theory"),
            create_item("p5_07_c2", "Теория №26", "Задача 34.2. Последовательность реакций. Порции. Расчёт массы конечного раствора.", "chem", "theory"),
        ]},
        "2026-11-08": {"dayName": "ВС", "dayNum": 8, "month": "ноя", "items": [
            create_item("p5_08_b1", "Онлайн-разбор пробника №6", "Биология", "bio", "webinar", icon="plus"),
            create_item("p5_08_r1", "Разбор произведения №14", "Рассказы Бунина", "rus", "review"),
        ]},

        "2026-11-09": {"dayName": "ПН", "dayNum": 9, "month": "ноя", "items": [
            create_item("p5_09_r1", "Практика №16", "МЕГАВЕБИНАР по орфографии. Русская рулетка", "rus", "practice", time="16:00", icon="clock"),
            create_item("p5_09_c1", "Пробник №7", "Химия", "chem", "mock"),
        ]},
        "2026-11-10": {"dayName": "ВТ", "dayNum": 10, "month": "ноя", "items": [
            create_item("p5_10_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.11 ДО 14.11", "general", "payment"),
            create_item("p5_10_b1", "Практика №23.1", "Генетика пола, Сцепленное с полом наследование, Родословные №1", "bio", "practice", time="16:00", icon="clock"),
            create_item("p5_10_r1", "Теория №27", "16 задание", "rus", "theory"),
        ]},
        "2026-11-11": {"dayName": "СР", "dayNum": 11, "month": "ноя", "items": [
            create_item("p5_11_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.11 ДО 14.11", "general", "payment"),
            create_item("p5_11_c1", "Практика №25", "Химическое равновесие.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p5_11_r1", "Разбор произведения №15", "Рассказы Чехова", "rus", "review"),
        ]},
        "2026-11-12": {"dayName": "ЧТ", "dayNum": 12, "month": "ноя", "items": [
            create_item("p5_12_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.11 ДО 14.11", "general", "payment"),
            create_item("p5_12_b1", "Практика №23.2", "Генетика пола, Сцепленное с полом наследование, Родословные №2", "bio", "practice", time="16:00", icon="clock"),
            create_item("p5_12_r1", "Теория №28", "17 задание", "rus", "theory"),
        ]},
        "2026-11-13": {"dayName": "ПТ", "dayNum": 13, "month": "ноя", "items": [
            create_item("p5_13_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.11 ДО 14.11", "general", "payment"),
            create_item("p5_13_c1", "Практика №26", "Задача 34.2. Последовательность реакций. Порции. Расчёт массы конечного раствора.", "chem", "practice", time="16:00", icon="clock"),
        ]},
        "2026-11-14": {"dayName": "СБ", "dayNum": 14, "month": "ноя", "items": [
            create_item("p5_14_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.11 ДО 14.11", "general", "payment"),
            create_item("p5_14_b1", "Эвристика с Аленой", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p5_14_b2", "Теория №24", "Взаимодействие неаллельных генов, Селекция и биотехнология", "bio", "theory"),
            create_item("p5_14_c1", "Теория №27", "Физические и химические свойства простых веществ.", "chem", "theory"),
            create_item("p5_14_r1", "Теория №29", "18 задание", "rus", "theory"),
        ]},
        "2026-11-15": {"dayName": "ВС", "dayNum": 15, "month": "ноя", "items": [
            create_item("p5_15_c1", "Клуб укротителей задач №7", "Задача 34.", "chem", "webinar", icon="plus"),
            create_item("p5_15_b1", "Пробник №4", "Биология", "bio", "mock"),
        ]},

        "2026-11-16": {"dayName": "ПН", "dayNum": 16, "month": "ноя", "items": [
            create_item("p5_16_r1", "Практика №17", "Итоговое сочинение + читаем рассказы Base", "rus", "practice", time="16:00", icon="clock"),
            create_item("p5_16_b1", "Теория №25", "Ткани человека", "bio", "theory"),
        ]},
        "2026-11-17": {"dayName": "ВТ", "dayNum": 17, "month": "ноя", "items": [
            create_item("p5_17_b1", "Практика №24", "Взаимодействие неаллельных генов, Селекция и биотехнология", "bio", "practice", time="16:00", icon="clock"),
            create_item("p5_17_r1", "Теория №30", "19 задание", "rus", "theory"),
        ]},
        "2026-11-18": {"dayName": "СР", "dayNum": 18, "month": "ноя", "items": [
            create_item("p5_18_b1", "Пробник №7", "Биология", "bio", "mock"),
            create_item("p5_18_c1", "Обобщающая практика по неорганике", "Химия", "chem", "practice"),
            create_item("p5_18_c2", "Рубежная аттестация №1 (общая и неорганическая химия)", "до 25.11", "chem", "attestation", icon="alert"),
            create_item("p5_18_r1", "Разбор произведения №16", "«Грозовой перевал»", "rus", "review"),
        ]},
        "2026-11-19": {"dayName": "ЧТ", "dayNum": 19, "month": "ноя", "items": [
            create_item("p5_19_b1", "Практика №25", "Ткани человека", "bio", "practice", time="16:00", icon="clock"),
            create_item("p5_19_r1", "Теория №31", "20 задание", "rus", "theory"),
        ]},
        "2026-11-20": {"dayName": "ПТ", "dayNum": 20, "month": "ноя", "items": [
            create_item("p5_20_c1", "Практика №27", "Физические и химические свойства простых веществ.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p5_20_r1", "Разбор произведения №17", "Рассказы Куприна", "rus", "review"),
        ]},
        "2026-11-21": {"dayName": "СБ", "dayNum": 21, "month": "ноя", "items": [
            create_item("p5_21_b1", "Разбор пробника №6 с Асифом", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p5_21_b2", "Теория №26", "Эндокринная система", "bio", "theory"),
            create_item("p5_21_c1", "Теория №28", "Основы органической химии.", "chem", "theory"),
            create_item("p5_21_c2", "Теория №29", "Задача 33 (1). Атомарность. Способы нахождения формулы вещества.", "chem", "theory"),
            create_item("p5_21_r1", "Практика №18", "Жёсткая нарешка заданий 16-21. К8 на максимум. Веб с экспертом ЕГЭ", "rus", "practice"),
            create_item("p5_21_r2", "Теория №32", "21 задание", "rus", "theory"),
        ]},
        "2026-11-22": {"dayName": "ВС", "dayNum": 22, "month": "ноя", "items": []}
    }
    periods.append({"id": "p05", "name": "2 ноября — 22 ноября", "days": p5_days})

    # ==========================================
    # ПЕРИОД 6: 23 ноября — 13 декабря (Стр 6)
    # ==========================================
    p6_days = {
        "2026-11-23": {"dayName": "ПН", "dayNum": 23, "month": "ноя", "items": [
            create_item("p6_23_r1", "Практика №19", "МЕГАВЕБИНАР по пунктуации. Русская рулетка", "rus", "practice", time="16:00", icon="clock"),
            create_item("p6_23_b1", "Теория №27", "Нервная система №1", "bio", "theory"),
            create_item("p6_23_c1", "Пробник №8", "Химия", "chem", "mock"),
        ]},
        "2026-11-24": {"dayName": "ВТ", "dayNum": 24, "month": "ноя", "items": [
            create_item("p6_24_b1", "Практика №26", "Эндокринная система", "bio", "practice", time="16:00", icon="clock"),
            create_item("p6_24_r1", "Интенсив по ИС", "Русский язык", "rus", "review"),
        ]},
        "2026-11-25": {"dayName": "СР", "dayNum": 25, "month": "ноя", "items": [
            create_item("p6_25_c1", "Практика №28", "Основы органической химии.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p6_25_r1", "Интенсив по ИС", "Русский язык", "rus", "review"),
        ]},
        "2026-11-26": {"dayName": "ЧТ", "dayNum": 26, "month": "ноя", "items": [
            create_item("p6_26_b1", "Практика №27", "Нервная система №1", "bio", "practice", time="16:00", icon="clock"),
            create_item("p6_26_r1", "Интенсив по ИС", "Русский язык", "rus", "review"),
        ]},
        "2026-11-27": {"dayName": "ПТ", "dayNum": 27, "month": "ноя", "items": [
            create_item("p6_27_c1", "Практика №29", "Задача 33 (1). Атомарность. Способы нахождения формулы вещества.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p6_27_r1", "Интенсив по ИС", "Русский язык", "rus", "review"),
        ]},
        "2026-11-28": {"dayName": "СБ", "dayNum": 28, "month": "ноя", "items": [
            create_item("p6_28_b1", "Эвристика с Аленой", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p6_28_b2", "Теория №28", "Нервная система №2", "bio", "theory"),
            create_item("p6_28_c1", "Теория №30", "Алканы.", "chem", "theory"),
            create_item("p6_28_c2", "Теория №31", "Задача 34.3. Электролиз. Растворимость. Кристаллогидраты.", "chem", "theory"),
            create_item("p6_28_r1", "Интенсив по ИС", "Русский язык", "rus", "review"),
        ]},
        "2026-11-29": {"dayName": "ВС", "dayNum": 29, "month": "ноя", "items": [
            create_item("p6_29_b1", "Рубежная аттестация №1 (общая биология и генетика)", "до 06.12", "bio", "attestation", icon="alert"),
            create_item("p6_29_c1", "Клуб укротителей задач №8", "Задача 33.", "chem", "webinar", icon="plus"),
            create_item("p6_29_r1", "Интенсив по ИС", "Русский язык", "rus", "review"),
        ]},

        "2026-11-30": {"dayName": "ПН", "dayNum": 30, "month": "ноя", "items": [
            create_item("p6_30_b1", "Теория №29", "Высшая нервная деятельность (ВНД)", "bio", "theory"),
            create_item("p6_30_r1", "Интенсив по ИС", "Русский язык", "rus", "review"),
        ]},
        "2026-12-01": {"dayName": "ВТ", "dayNum": 1, "month": "дек", "items": [
            create_item("p6_01_b1", "Практика №28", "Нервная система №2", "bio", "practice", time="16:00", icon="clock"),
            create_item("p6_01_r1", "Интенсив по ИС", "Русский язык", "rus", "review"),
        ]},
        "2026-12-02": {"dayName": "СР", "dayNum": 2, "month": "дек", "items": [
            create_item("p6_02_b1", "Пробник №8", "Биология", "bio", "mock"),
            create_item("p6_02_c1", "Практика №30", "Алканы.", "chem", "practice"),
            create_item("p6_02_c2", "ПЕРЕСДАЧА: Рубежная аттестация №1 (общая и неорганическая химия)", "до 09.12", "chem", "attestation", icon="alert"),
            create_item("p6_02_r1", "Итоговое сочинение", "Русский язык", "rus", "review"),
            create_item("p6_02_r2", "Тест №4", "Русский язык", "rus", "test"),
        ]},
        "2026-12-03": {"dayName": "ЧТ", "dayNum": 3, "month": "дек", "items": [
            create_item("p6_03_b1", "Практика №29", "Высшая нервная деятельность (ВНД)", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-12-04": {"dayName": "ПТ", "dayNum": 4, "month": "дек", "items": [
            create_item("p6_04_c1", "Практика №31", "Задача 34.3. Электролиз. Растворимость. Кристаллогидраты.", "chem", "practice", time="16:00", icon="clock"),
        ]},
        "2026-12-05": {"dayName": "СБ", "dayNum": 5, "month": "дек", "items": [
            create_item("p6_05_b1", "Разбор пробника №7 с Асифом", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p6_05_r1", "Практика №20", "Пишем сочинение по базовому и сложному текстам. Веб с экспертом ЕГЭ", "rus", "practice", time="16:00", icon="clock"),
            create_item("p6_05_b2", "Теория №30", "Анализаторы", "bio", "theory"),
            create_item("p6_05_c1", "Теория №32", "ОВР в органической химии.", "chem", "theory"),
            create_item("p6_05_c2", "Теория №33", "Алкены.", "chem", "theory"),
        ]},
        "2026-12-06": {"dayName": "ВС", "dayNum": 6, "month": "дек", "items": [
            create_item("p6_06_c1", "Онлайн-разбор пробника №8", "Химия", "chem", "webinar", icon="plus"),
        ]},

        "2026-12-07": {"dayName": "ПН", "dayNum": 7, "month": "дек", "items": [
            create_item("p6_07_b1", "Теория №31", "Опорно-двигательный аппарат, Покровы тела", "bio", "theory"),
            create_item("p6_07_c1", "Пробник №9", "Химия", "chem", "mock"),
            create_item("p6_07_r1", "Практика №21", "Сочинение ЕГЭ: вспоминаем всё. Комментарим", "rus", "practice"),
            create_item("p6_07_r2", "Теория №33", "1 задание", "rus", "theory"),
        ]},
        "2026-12-08": {"dayName": "ВТ", "dayNum": 8, "month": "дек", "items": [
            create_item("p6_08_b1", "Практика №30", "Анализаторы", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-12-09": {"dayName": "СР", "dayNum": 9, "month": "дек", "items": [
            create_item("p6_09_c1", "Практика №32", "ОВР в органической химии.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p6_09_r1", "Теория №34", "2 задание", "rus", "theory"),
        ]},
        "2026-12-10": {"dayName": "ЧТ", "dayNum": 10, "month": "дек", "items": [
            create_item("p6_10_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.12 ДО 14.12", "general", "payment"),
            create_item("p6_10_b1", "Практика №31", "Опорно-двигательный аппарат, Покровы тела", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-12-11": {"dayName": "ПТ", "dayNum": 11, "month": "дек", "items": [
            create_item("p6_11_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.12 ДО 14.12", "general", "payment"),
            create_item("p6_11_c1", "Практика №33", "Алкены.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p6_11_r1", "Теория №35", "Стили и типы речи", "rus", "theory"),
        ]},
        "2026-12-12": {"dayName": "СБ", "dayNum": 12, "month": "дек", "items": [
            create_item("p6_12_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.12 ДО 14.12", "general", "payment"),
            create_item("p6_12_b1", "Эвристика с Аленой", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p6_12_b2", "Теория №32", "Кровеносная система", "bio", "theory"),
            create_item("p6_12_c1", "Теория №34", "Задача 33 (2). Все типы расчётов в задаче 33.", "chem", "theory"),
            create_item("p6_12_c2", "Теория №35", "Алкадиены.", "chem", "theory"),
        ]},
        "2026-12-13": {"dayName": "ВС", "dayNum": 13, "month": "дек", "items": [
            create_item("p6_13_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.12 ДО 14.12", "general", "payment"),
            create_item("p6_13_b1", "Пересдача / Рубежная аттестация №1: Общая биология и Генетика", "до 20.12", "bio", "attestation", icon="alert"),
            create_item("p6_13_c1", "Клуб укротителей задач №9", "Задача 34.", "chem", "webinar", icon="plus"),
        ]}
    }
    periods.append({"id": "p06", "name": "23 ноября — 13 декабря", "days": p6_days})

    # ==========================================
    # ПЕРИОД 7: 14 декабря — 10 января (Стр 7)
    # ==========================================
    p7_days = {
        "2026-12-14": {"dayName": "ПН", "dayNum": 14, "month": "дек", "items": [
            create_item("p7_14_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.12 ДО 14.12", "general", "payment"),
            create_item("p7_14_r1", "Практика №22", "Учимся работать с текстом", "rus", "practice"),
            create_item("p7_14_r2", "Зачетный диктант №2", "Русский язык", "rus", "credit", icon="check"),
        ]},
        "2026-12-15": {"dayName": "ВТ", "dayNum": 15, "month": "дек", "items": [
            create_item("p7_15_b1", "Практика №32.1", "Кровеносная система №1", "bio", "practice", time="16:00", icon="clock"),
            create_item("p7_15_c1", "Пробник №5", "Химия", "chem", "mock"),
        ]},
        "2026-12-16": {"dayName": "СР", "dayNum": 16, "month": "дек", "items": [
            create_item("p7_16_c1", "Практика №34", "Задача 33 (2). Все типы расчётов в задаче 33.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p7_16_b1", "Пробник №9", "Биология", "bio", "mock"),
            create_item("p7_16_r1", "Теория №36", "3 задание", "rus", "theory"),
        ]},
        "2026-12-17": {"dayName": "ЧТ", "dayNum": 17, "month": "дек", "items": [
            create_item("p7_17_b1", "Практика №32.2", "Кровеносная система №2", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-12-18": {"dayName": "ПТ", "dayNum": 18, "month": "дек", "items": [
            create_item("p7_18_c1", "Практика №35", "Алкадиены.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p7_18_r1", "Теория №37", "24 задание", "rus", "theory"),
        ]},
        "2026-12-19": {"dayName": "СБ", "dayNum": 19, "month": "дек", "items": [
            create_item("p7_19_b1", "Разбор пробника №8 с Асифом", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p7_19_r1", "Практика №23", "Жёсткая нарешка заданий 3 и 24. Все ловушки 3 задания. Веб с экспертом ЕГЭ", "rus", "practice", time="16:00", icon="clock"),
            create_item("p7_19_b2", "Теория №33", "Дыхательная система", "bio", "theory"),
            create_item("p7_19_c1", "Теория №36", "Циклические углеводороды (циклы).", "chem", "theory"),
            create_item("p7_19_c2", "Теория №37", "Задача 34.4. Смеси. Неполное разложение. Задачи на два случая. Введение переменной в одну реакцию.", "chem", "theory"),
        ]},
        "2026-12-20": {"dayName": "ВС", "dayNum": 20, "month": "дек", "items": []},

        "2026-12-21": {"dayName": "ПН", "dayNum": 21, "month": "дек", "items": [
            create_item("p7_21_r1", "Практика №24", "Сочинение ЕГЭ + Вспоминаем части речи. Нетиповый вебчик", "rus", "practice", time="16:00", icon="clock"),
            create_item("p7_21_b1", "Теория №34", "Пищеварительная система, Витамины и их сохранение", "bio", "theory"),
            create_item("p7_21_c1", "Пробник №10", "Химия", "chem", "mock"),
        ]},
        "2026-12-22": {"dayName": "ВТ", "dayNum": 22, "month": "дек", "items": [
            create_item("p7_22_b1", "Практика №33", "Дыхательная система", "bio", "practice", time="16:00", icon="clock"),
            create_item("p7_22_r1", "Рубежная аттестация №2: Пунктуация + Работа с текстом", "до 29.12", "rus", "attestation", icon="alert"),
        ]},
        "2026-12-23": {"dayName": "СР", "dayNum": 23, "month": "дек", "items": [
            create_item("p7_23_c1", "Практика №36", "Циклические углеводороды (циклы).", "chem", "practice", time="16:00", icon="clock"),
            create_item("p7_23_r1", "Теория №38", "25 задание", "rus", "theory"),
        ]},
        "2026-12-24": {"dayName": "ЧТ", "dayNum": 24, "month": "дек", "items": [
            create_item("p7_24_b1", "Практика №34", "Пищеварительная система, Витамины и их сохранение", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-12-25": {"dayName": "ПТ", "dayNum": 25, "month": "дек", "items": [
            create_item("p7_25_c1", "Практика №37", "Задача 34.4. Смеси. Неполное разложение. Задачи на два случая. Введение переменной в одну реакцию.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p7_25_r1", "Теория №39", "26 задание", "rus", "theory"),
        ]},
        "2026-12-26": {"dayName": "СБ", "dayNum": 26, "month": "дек", "items": [
            create_item("p7_26_b1", "Эвристика с Аленой", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p7_26_b2", "Теория №35", "Мочевыделительная и половая системы, Первая помощь", "bio", "theory"),
            create_item("p7_26_c1", "Теория №38", "Алкины.", "chem", "theory"),
            create_item("p7_26_c2", "Теория №39", "Арены.", "chem", "theory"),
        ]},
        "2026-12-27": {"dayName": "ВС", "dayNum": 27, "month": "дек", "items": [
            create_item("p7_27_c1", "Клуб укротителей задач №10", "Задачи 34.", "chem", "webinar", icon="plus"),
            create_item("p7_27_r1", "Теория №40", "23 задание", "rus", "theory"),
        ]},

        "2026-12-28": {"dayName": "ПН", "dayNum": 28, "month": "дек", "items": [
            create_item("p7_28_r1", "Практика №25", "МЕГАВЕБИНАР с экспертом. Решаем полный вариант + работа с текстом. Русская рулетка", "rus", "practice", time="16:00", icon="clock"),
        ]},
        "2026-12-29": {"dayName": "ВТ", "dayNum": 29, "month": "дек", "items": [
            create_item("p7_29_b1", "Практика №35", "Мочевыделительная и половая системы, Первая помощь", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2026-12-30": {"dayName": "СР", "dayNum": 30, "month": "дек", "items": []},
        "2026-12-31": {"dayName": "ЧТ", "dayNum": 31, "month": "дек", "items": []},
        "2027-01-01": {"dayName": "ПТ", "dayNum": 1, "month": "янв", "items": []},
        "2027-01-02": {"dayName": "СБ", "dayNum": 2, "month": "янв", "items": []},
        "2027-01-03": {"dayName": "ВС", "dayNum": 3, "month": "янв", "items": []},

        "2027-01-04": {"dayName": "ПН", "dayNum": 4, "month": "янв", "items": []},
        "2027-01-05": {"dayName": "ВТ", "dayNum": 5, "month": "янв", "items": []},
        "2027-01-06": {"dayName": "СР", "dayNum": 6, "month": "янв", "items": [
            create_item("p7_06_c1", "Практика №38", "Алкины.", "chem", "practice"),
            create_item("p7_06_b1", "Пробник №11", "Биология", "bio", "mock"),
        ]},
        "2027-01-07": {"dayName": "ЧТ", "dayNum": 7, "month": "янв", "items": []},
        "2027-01-08": {"dayName": "ПТ", "dayNum": 8, "month": "янв", "items": [
            create_item("p7_08_c1", "Практика №39", "Арены.", "chem", "practice", time="16:00", icon="clock"),
        ]},
        "2027-01-09": {"dayName": "СБ", "dayNum": 9, "month": "янв", "items": [
            create_item("p7_09_r1", "Практика №26", "Пишем сочинения по завальным текстам. Углубляемся. К10 на максимум. Веб с экспертом ЕГЭ", "rus", "practice", time="16:00", icon="clock"),
            create_item("p7_09_b1", "Теория №36", "Царство Животные, Подцарство Простейшие (Одноклеточные), Тип Кишечно-полостные", "bio", "theory"),
            create_item("p7_09_c1", "Теория №40", "Спирты. Многоатомные спирты.", "chem", "theory"),
            create_item("p7_09_c2", "Теория №41", "Задача 34.5. Введение одной переменной. Масса конечного раствора. Изменение массы раствора. Изменение массовой доли.", "chem", "theory"),
        ]},
        "2027-01-10": {"dayName": "ВС", "dayNum": 10, "month": "янв", "items": [
            create_item("p7_10_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.01 ДО 14.01", "general", "payment"),
            create_item("p7_10_b1", "Рубежная аттестация №2 (анатомия и физиология человека)", "до 17.01", "bio", "attestation", icon="alert"),
            create_item("p7_10_c1", "Клуб укротителей задач №11", "Задача 33.", "chem", "webinar", icon="plus"),
        ]}
    }
    periods.append({"id": "p07", "name": "14 декабря — 10 января", "days": p7_days})

    # ==========================================
    # ПЕРИОД 8: 11 января — 31 января (Стр 8)
    # ==========================================
    p8_days = {
        "2027-01-11": {"dayName": "ПН", "dayNum": 11, "month": "янв", "items": [
            create_item("p8_11_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.01 ДО 14.01", "general", "payment"),
            create_item("p8_11_r1", "Практика №27", "Вспоминаем все и решаем вариант. Нетиповый вебчик", "rus", "practice", time="16:00", icon="clock"),
            create_item("p8_11_b1", "Теория №37", "Черви", "bio", "theory"),
        ]},
        "2027-01-12": {"dayName": "ВТ", "dayNum": 12, "month": "янв", "items": [
            create_item("p8_12_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.01 ДО 14.01", "general", "payment"),
            create_item("p8_12_b1", "Практика №36", "Царство Животные, Подцарство Простейшие (Одноклеточные), Тип Кишечно-полостные", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-01-13": {"dayName": "СР", "dayNum": 13, "month": "янв", "items": [
            create_item("p8_13_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.01 ДО 14.01", "general", "payment"),
            create_item("p8_13_c1", "Практика №40", "Спирты. Многоатомные спирты.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p8_13_b1", "Пробник №10", "Биология", "bio", "mock"),
            create_item("p8_13_r1", "Теория №41", "4 задание", "rus", "theory"),
        ]},
        "2027-01-14": {"dayName": "ЧТ", "dayNum": 14, "month": "янв", "items": [
            create_item("p8_14_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.01 ДО 14.01", "general", "payment"),
            create_item("p8_14_b1", "Практика №37", "Черви", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-01-15": {"dayName": "ПТ", "dayNum": 15, "month": "янв", "items": [
            create_item("p8_15_c1", "Практика №41", "Задача 34.5. Введение одной переменной. Масса конечного раствора. Изменение массы раствора. Изменение массовой доли.", "chem", "practice"),
            create_item("p8_15_c2", "Зачёт №3 (до 24.01)", "Химия", "chem", "credit", icon="check"),
            create_item("p8_15_r1", "Теория №42", "5 задание", "rus", "theory"),
            create_item("p8_15_b1", "Пробник №6", "Биология", "bio", "mock"),
        ]},
        "2027-01-16": {"dayName": "СБ", "dayNum": 16, "month": "янв", "items": [
            create_item("p8_16_b1", "Разбор пробника №9 с Асифом", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p8_16_b2", "Теория №38", "Тип Моллюски, Тип Членистоногие №1", "bio", "theory"),
            create_item("p8_16_c1", "Теория №42", "Фенолы. Простые эфиры.", "chem", "theory"),
            create_item("p8_16_c2", "Теория №43", "Альдегиды и кетоны.", "chem", "theory"),
        ]},
        "2027-01-17": {"dayName": "ВС", "dayNum": 17, "month": "янв", "items": [
            create_item("p8_17_c1", "Онлайн-разбор пробника №11", "Химия", "chem", "webinar", icon="plus"),
            create_item("p8_17_r1", "Теория №43", "6 задание", "rus", "theory"),
        ]},

        "2027-01-18": {"dayName": "ПН", "dayNum": 18, "month": "янв", "items": [
            create_item("p8_18_r1", "Практика №28", "Сочинение ЕГЭ Комментарим", "rus", "practice", time="16:00", icon="clock"),
            create_item("p8_18_b1", "Теория №39", "Тип Членистоногие №2", "bio", "theory"),
            create_item("p8_18_c1", "Пробник №12", "Химия", "chem", "mock"),
        ]},
        "2027-01-19": {"dayName": "ВТ", "dayNum": 19, "month": "янв", "items": [
            create_item("p8_19_b1", "Практика №38", "Тип Моллюски, Тип Членистоногие №1", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-01-20": {"dayName": "СР", "dayNum": 20, "month": "янв", "items": [
            create_item("p8_20_c1", "Практика №42", "Фенолы. Простые эфиры.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p8_20_r1", "Теория №44", "7 задание", "rus", "theory"),
        ]},
        "2027-01-21": {"dayName": "ЧТ", "dayNum": 21, "month": "янв", "items": [
            create_item("p8_21_b1", "Практика №39", "Тип Членистоногие №2", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-01-22": {"dayName": "ПТ", "dayNum": 22, "month": "янв", "items": [
            create_item("p8_22_c1", "Практика №43", "Альдегиды и кетоны.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p8_22_r1", "Теория №45", "8 задание", "rus", "theory"),
        ]},
        "2027-01-23": {"dayName": "СБ", "dayNum": 23, "month": "янв", "items": [
            create_item("p8_23_b1", "Эвристика с Аленой", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p8_23_r1", "Практика №29", "Сумасшедшая нарешка заданий 4-8. К10 на максимум. Веб с экспертом ЕГЭ", "rus", "practice", time="16:00", icon="clock"),
            create_item("p8_23_b2", "Теория №40", "Тип Хордовые, Класс Головохордовые, Надкласс Рыбы", "bio", "theory"),
            create_item("p8_23_c1", "Теория №44", "Карбоновые кислоты.", "chem", "theory"),
            create_item("p8_23_c2", "Теория №45", "Задача 34.6. Введение двух переменных. Типы солей. Соотношения и их преобразования.", "chem", "theory"),
        ]},
        "2027-01-24": {"dayName": "ВС", "dayNum": 24, "month": "янв", "items": [
            create_item("p8_24_b1", "Пересдача / Рубежная аттестация №2: Анатомия и физиология человека", "до 31.01", "bio", "attestation", icon="alert"),
            create_item("p8_24_c1", "Клуб укротителей задач №12", "Задача 34.", "chem", "webinar", icon="plus"),
            create_item("p8_24_r1", "Теория №46", "22 задание", "rus", "theory"),
        ]},

        "2027-01-25": {"dayName": "ПН", "dayNum": 25, "month": "янв", "items": [
            create_item("p8_25_r1", "Практика №30", "МЕГАВЕБИНАР по заданиям 4-8, 22. Русская рулетка", "rus", "practice", time="16:00", icon="clock"),
            create_item("p8_25_b1", "Теория №41", "Класс Земноводные (Амфибии), Класс Пресмыкающиеся (Рептилии), Анамнии и амниоты", "bio", "theory"),
        ]},
        "2027-01-26": {"dayName": "ВТ", "dayNum": 26, "month": "янв", "items": [
            create_item("p8_26_b1", "Практика №40", "Тип Хордовые, Класс Головохордовые, Надкласс Рыбы", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-01-27": {"dayName": "СР", "dayNum": 27, "month": "янв", "items": [
            create_item("p8_27_c1", "Практика №44", "Карбоновые кислоты.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p8_27_b1", "Пробник №11", "Биология", "bio", "mock"),
            create_item("p8_27_r1", "Теория №47", "9 задание", "rus", "theory"),
        ]},
        "2027-01-28": {"dayName": "ЧТ", "dayNum": 28, "month": "янв", "items": [
            create_item("p8_28_b1", "Практика №41", "Класс Земноводные (Амфибии), Класс Пресмыкающиеся (Рептилии), Анамнии и амниоты", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-01-29": {"dayName": "ПТ", "dayNum": 29, "month": "янв", "items": [
            create_item("p8_29_c1", "Практика №45", "Задача 34.6. Введение двух переменных. Типы солей. Соотношения и их преобразования.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p8_29_r1", "Теория №48", "10 задание", "rus", "theory"),
        ]},
        "2027-01-30": {"dayName": "СБ", "dayNum": 30, "month": "янв", "items": [
            create_item("p8_30_b1", "Разбор пробника №10 с Асифом", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p8_30_b2", "Теория №42", "Класс Птицы, Класс Млекопитающие (Звери)", "bio", "theory"),
            create_item("p8_30_c1", "Теория №46", "Сложные эфиры. Жиры. Мыла.", "chem", "theory"),
            create_item("p8_30_c2", "Теория №47", "Амины. Нитросоединения.", "chem", "theory"),
        ]},
        "2027-01-31": {"dayName": "ВС", "dayNum": 31, "month": "янв", "items": []}
    }
    periods.append({"id": "p08", "name": "11 января — 31 января", "days": p8_days})

    # ==========================================
    # ПЕРИОД 9: 1 февраля — 21 февраля (Стр 9)
    # ==========================================
    p9_days = {
        "2027-02-01": {"dayName": "ПН", "dayNum": 1, "month": "фев", "items": [
            create_item("p9_01_b1", "Теория №43", "Разнообразие Позвоночных", "bio", "theory"),
            create_item("p9_01_c1", "Пробник №13", "Химия", "chem", "mock"),
            create_item("p9_01_r1", "Практика №31", "9 задание + 10 задание + сочинение ЕГЭ. Нетиповый вебчик", "rus", "practice"),
            create_item("p9_01_r2", "Зачетный диктант №3", "Русский язык", "rus", "credit", icon="check"),
        ]},
        "2027-02-02": {"dayName": "ВТ", "dayNum": 2, "month": "фев", "items": [
            create_item("p9_02_b1", "Практика №42", "Класс Птицы, Класс Млекопитающие (Звери)", "bio", "practice", time="16:00", icon="clock"),
            create_item("p9_02_r1", "Тест №5", "Русский язык", "rus", "test"),
        ]},
        "2027-02-03": {"dayName": "СР", "dayNum": 3, "month": "фев", "items": [
            create_item("p9_03_c1", "Практика №46", "Сложные эфиры. Жиры. Мыла.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p9_03_r1", "Теория №49", "11 задание", "rus", "theory"),
        ]},
        "2027-02-04": {"dayName": "ЧТ", "dayNum": 4, "month": "фев", "items": [
            create_item("p9_04_b1", "Практика №43", "Разнообразие Позвоночных", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-02-05": {"dayName": "ПТ", "dayNum": 5, "month": "фев", "items": [
            create_item("p9_05_c1", "Практика №47", "Амины. Нитросоединения.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p9_05_r1", "Теория №50", "12 задание", "rus", "theory"),
        ]},
        "2027-02-06": {"dayName": "СБ", "dayNum": 6, "month": "фев", "items": [
            create_item("p9_06_b1", "Эвристика с Аленой", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p9_06_r1", "Практика №32", "К1-К6 на максимум. Сумасшедшая нарешка заданий 9-12. Веб с экспертом ЕГЭ", "rus", "practice", time="16:00", icon="clock"),
            create_item("p9_06_b2", "Теория №44", "Царство Растения, Ткани Растений", "bio", "theory"),
            create_item("p9_06_c1", "Зачет №3 до 14.02", "Химия", "chem", "credit", icon="check"),
            create_item("p9_06_c2", "Теория №48", "Аминокислоты. Белки.", "chem", "theory"),
            create_item("p9_06_c3", "Теория №49", "Задача 34.7. Атомарность.", "chem", "theory"),
        ]},
        "2027-02-07": {"dayName": "ВС", "dayNum": 7, "month": "фев", "items": [
            create_item("p9_07_c1", "Клуб укротителей задач №13", "Задача 34.", "chem", "webinar", icon="plus"),
        ]},

        "2027-02-08": {"dayName": "ПН", "dayNum": 8, "month": "фев", "items": [
            create_item("p9_08_r1", "Практика №33", "9-12 задания + аргументация в сочинении. Нетиповый вебчик", "rus", "practice", time="16:00", icon="clock"),
            create_item("p9_08_b1", "Теория №45", "Вегетативные органы растений — корень, побег и стебель", "bio", "theory"),
        ]},
        "2027-02-09": {"dayName": "ВТ", "dayNum": 9, "month": "фев", "items": [
            create_item("p9_09_b1", "Практика №44", "Царство Растения, Ткани Растений", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-02-10": {"dayName": "СР", "dayNum": 10, "month": "фев", "items": [
            create_item("p9_10_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.02 ДО 14.02", "general", "payment"),
            create_item("p9_10_c1", "Практика №48", "Аминокислоты. Белки.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p9_10_b1", "Пробник №12", "Биология", "bio", "mock"),
            create_item("p9_10_r1", "Теория №51", "13 задание", "rus", "theory"),
        ]},
        "2027-02-11": {"dayName": "ЧТ", "dayNum": 11, "month": "фев", "items": [
            create_item("p9_11_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.02 ДО 14.02", "general", "payment"),
            create_item("p9_11_b1", "Практика №45", "Вегетативные органы растений — корень, побег и стебель", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-02-12": {"dayName": "ПТ", "dayNum": 12, "month": "фев", "items": [
            create_item("p9_12_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.02 ДО 14.02", "general", "payment"),
            create_item("p9_12_c1", "Практика №49", "Задача 34.7. Атомарность.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p9_12_r1", "Теория №52", "14 задание (часть 1)", "rus", "theory"),
        ]},
        "2027-02-13": {"dayName": "СБ", "dayNum": 13, "month": "фев", "items": [
            create_item("p9_13_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.02 ДО 14.02", "general", "payment"),
            create_item("p9_13_b1", "Разбор пробника №11 с Асифом", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p9_13_b2", "Теория №46", "Вегетативные органы растений — лист, Вегетативное размножение растений, Огород", "bio", "theory"),
            create_item("p9_13_c1", "Теория №50", "Углеводы.", "chem", "theory"),
            create_item("p9_13_c2", "Теория №51", "Галогенпроизводные. Природные источники углеводородов.", "chem", "theory"),
        ]},
        "2027-02-14": {"dayName": "ВС", "dayNum": 14, "month": "фев", "items": [
            create_item("p9_14_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.02 ДО 14.02", "general", "payment"),
            create_item("p9_14_c1", "Онлайн-разбор пробника №13", "Химия", "chem", "webinar", icon="plus"),
        ]},

        "2027-02-15": {"dayName": "ПН", "dayNum": 15, "month": "фев", "items": [
            create_item("p9_15_b1", "Теория №47", "Генеративные органы растений — цветок, семя и плод", "bio", "theory"),
            create_item("p9_15_c1", "Пробник №14", "Химия", "chem", "mock"),
            create_item("p9_15_r1", "Практика №34", "13-14 задания + аргументация в сочинении. Нетиповый вебчик", "rus", "practice"),
            create_item("p9_15_b2", "Пробник №7", "Биология", "bio", "mock"),
        ]},
        "2027-02-16": {"dayName": "ВТ", "dayNum": 16, "month": "фев", "items": [
            create_item("p9_16_b1", "Практика №46", "Вегетативные органы растений — лист, Вегетативное размножение растений, Огород", "bio", "practice", time="16:00", icon="clock"),
            create_item("p9_16_r1", "Рубежная аттестация №3: Сочинение ЕГЭ, критерии сочинения, аргументация своей позиции", "до 23.02", "rus", "attestation", icon="alert"),
        ]},
        "2027-02-17": {"dayName": "СР", "dayNum": 17, "month": "фев", "items": [
            create_item("p9_17_c1", "Практика №50", "Углеводы.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p9_17_r1", "Теория №53", "14 задание (часть 2)", "rus", "theory"),
        ]},
        "2027-02-18": {"dayName": "ЧТ", "dayNum": 18, "month": "фев", "items": [
            create_item("p9_18_b1", "Практика №47", "Генеративные органы растений — цветок, семя и плод", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-02-19": {"dayName": "ПТ", "dayNum": 19, "month": "фев", "items": [
            create_item("p9_19_c1", "Практика №51", "Галогенпроизводные. Природные источники углеводородов.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p9_19_r1", "Теория №54", "15 задание", "rus", "theory"),
        ]},
        "2027-02-20": {"dayName": "СБ", "dayNum": 20, "month": "фев", "items": [
            create_item("p9_20_b1", "Эвристика с Аленой", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p9_20_r1", "Практика №35", "К7 на максимум. Сумасшедшая нарешка заданий 13-15. Веб с экспертом ЕГЭ", "rus", "practice", time="16:00", icon="clock"),
            create_item("p9_20_b2", "Теория №48", "Водоросли, Жизненные формы растений, Споровые", "bio", "theory"),
            create_item("p9_20_c1", "Теория №52", "Задача 34.8. Растворимость. Растворимость КГ.", "chem", "theory"),
        ]},
        "2027-02-21": {"dayName": "ВС", "dayNum": 21, "month": "фев", "items": [
            create_item("p9_21_c1", "Клуб укротителей задач №14", "Задача 34.", "chem", "webinar", icon="plus"),
        ]}
    }
    periods.append({"id": "p09", "name": "1 февраля — 21 февраля", "days": p9_days})

    # ==========================================
    # ПЕРИОД 10: 22 февраля — 14 марта (Стр 10)
    # ==========================================
    p10_days = {
        "2027-02-22": {"dayName": "ПН", "dayNum": 22, "month": "фев", "items": [
            create_item("p10_22_r1", "Практика №36", "МЕГАВЕБИНАР по орфографии. Русская рулетка", "rus", "practice", time="16:00", icon="clock"),
            create_item("p10_22_b1", "Теория №49", "Семенные растения", "bio", "theory"),
        ]},
        "2027-02-23": {"dayName": "ВТ", "dayNum": 23, "month": "фев", "items": [
            create_item("p10_23_b1", "Практика №48", "Водоросли, Жизненные формы растений, Споровые", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-02-24": {"dayName": "СР", "dayNum": 24, "month": "фев", "items": [
            create_item("p10_24_b1", "Пробник №13", "Биология", "bio", "mock"),
            create_item("p10_24_c1", "Обобщающая практика по органике", "Химия", "chem", "practice"),
            create_item("p10_24_c2", "Рубежная аттестация №2 (органическая химия)", "до 03.03", "chem", "attestation", icon="alert"),
            create_item("p10_24_r1", "Теория №55", "16 задание", "rus", "theory"),
        ]},
        "2027-02-25": {"dayName": "ЧТ", "dayNum": 25, "month": "фев", "items": [
            create_item("p10_25_b1", "Практика №49", "Семенные растения", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-02-26": {"dayName": "ПТ", "dayNum": 26, "month": "фев", "items": [
            create_item("p10_26_c1", "Практика №52", "Задача 34.8. Растворимость. Растворимость КГ.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p10_26_r1", "Теория №56", "17 задание", "rus", "theory"),
        ]},
        "2027-02-27": {"dayName": "СБ", "dayNum": 27, "month": "фев", "items": [
            create_item("p10_27_b1", "Разбор пробника №12 с Асифом", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p10_27_b2", "Теория №50", "Жизненные циклы растений №1", "bio", "theory"),
            create_item("p10_27_c1", "Теория №53", "Закономерности ОВР.", "chem", "theory"),
            create_item("p10_27_c2", "Теория №54", "Задача 34.9. Электролиз. Пластинка.", "chem", "theory"),
        ]},
        "2027-02-28": {"dayName": "ВС", "dayNum": 28, "month": "фев", "items": []},

        "2027-03-01": {"dayName": "ПН", "dayNum": 1, "month": "мар", "items": [
            create_item("p10_01_b1", "Теория №51", "Жизненные циклы растений №2", "bio", "theory"),
            create_item("p10_01_c1", "Пробник №15", "Химия", "chem", "mock"),
            create_item("p10_01_r1", "Практика №37", "Сочинение ЕГЭ Комментарим", "rus", "practice"),
            create_item("p10_01_r2", "Зачетный диктант №4", "Русский язык", "rus", "credit", icon="check"),
        ]},
        "2027-03-02": {"dayName": "ВТ", "dayNum": 2, "month": "мар", "items": [
            create_item("p10_02_b1", "Практика №50", "Жизненные циклы растений №1", "bio", "practice", time="16:00", icon="clock"),
            create_item("p10_02_r1", "Тест №6", "Русский язык", "rus", "test"),
        ]},
        "2027-03-03": {"dayName": "СР", "dayNum": 3, "month": "мар", "items": [
            create_item("p10_03_c1", "Практика №53", "Закономерности ОВР.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p10_03_r1", "Теория №57", "18 задание", "rus", "theory"),
        ]},
        "2027-03-04": {"dayName": "ЧТ", "dayNum": 4, "month": "мар", "items": [
            create_item("p10_04_b1", "Практика №51", "Жизненные циклы растений №2", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-03-05": {"dayName": "ПТ", "dayNum": 5, "month": "мар", "items": [
            create_item("p10_05_c1", "Практика №54", "Задача 34.9. Электролиз. Пластинка.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p10_05_r1", "Теория №58", "19 задание", "rus", "theory"),
        ]},
        "2027-03-06": {"dayName": "СБ", "dayNum": 6, "month": "мар", "items": [
            create_item("p10_06_b1", "Эвристика с Аленой", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p10_06_r1", "Практика №38", "Пишем и вычитываем сочинение. Самопроверка на экзамене. Повторяем все критерии. Сумасшедшая нарешка заданий 16-19. Веб с экспертом ЕГЭ", "rus", "practice", time="16:00", icon="clock"),
            create_item("p10_06_b2", "Теория №52", "Развитие эволюционных идей", "bio", "theory"),
            create_item("p10_06_c1", "Теория №55", "Водород. Пероксид водорода.", "chem", "theory"),
            create_item("p10_06_c2", "Теория №56", "Галогены.", "chem", "theory"),
        ]},
        "2027-03-07": {"dayName": "ВС", "dayNum": 7, "month": "мар", "items": [
            create_item("p10_07_b1", "Рубежная аттестация №3 (зоология и ботаника)", "до 14.03", "bio", "attestation", icon="alert"),
            create_item("p10_07_c1", "Клуб укротителей задач №15", "Задачи 33 и 34.", "chem", "webinar", icon="plus"),
        ]},

        "2027-03-08": {"dayName": "ПН", "dayNum": 8, "month": "мар", "items": [
            create_item("p10_08_r1", "Практика №39", "16-19 задания + аргументация в сочинении. Нетиповый вебчик", "rus", "practice", time="16:00", icon="clock"),
            create_item("p10_08_b1", "Теория №53", "Движущие силы (факторы) эволюции", "bio", "theory"),
        ]},
        "2027-03-09": {"dayName": "ВТ", "dayNum": 9, "month": "мар", "items": [
            create_item("p10_09_b1", "Практика №52", "Развитие эволюционных идей", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-03-10": {"dayName": "СР", "dayNum": 10, "month": "мар", "items": [
            create_item("p10_10_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.03 ДО 14.03", "general", "payment"),
            create_item("p10_10_b1", "Пробник №14", "Биология", "bio", "mock"),
            create_item("p10_10_c1", "Практика №55", "Водород. Пероксид водорода.", "chem", "practice"),
            create_item("p10_10_c2", "ПЕРЕСДАЧА: Рубежная аттестация №2 (органическая химия)", "до 17.03", "chem", "attestation", icon="alert"),
            create_item("p10_10_r1", "Теория №59", "20 задание", "rus", "theory"),
        ]},
        "2027-03-11": {"dayName": "ЧТ", "dayNum": 11, "month": "мар", "items": [
            create_item("p10_11_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.03 ДО 14.03", "general", "payment"),
            create_item("p10_11_b1", "Практика №53", "Движущие силы (факторы) эволюции", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-03-12": {"dayName": "ПТ", "dayNum": 12, "month": "мар", "items": [
            create_item("p10_12_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.03 ДО 14.03", "general", "payment"),
            create_item("p10_12_c1", "Практика №56", "Галогены.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p10_12_r1", "Теория №60", "21 задание", "rus", "theory"),
        ]},
        "2027-03-13": {"dayName": "СБ", "dayNum": 13, "month": "мар", "items": [
            create_item("p10_13_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.03 ДО 14.03", "general", "payment"),
            create_item("p10_13_b1", "Разбор пробника №13 с Асифом", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p10_13_b2", "Теория №54", "Микроэволюция", "bio", "theory"),
            create_item("p10_13_c1", "Теория №57", "Кислород. Сера.", "chem", "theory"),
            create_item("p10_13_c2", "Теория №58", "Азот.", "chem", "theory"),
        ]},
        "2027-03-14": {"dayName": "ВС", "dayNum": 14, "month": "мар", "items": [
            create_item("p10_14_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.03 ДО 14.03", "general", "payment"),
            create_item("p10_14_c1", "Онлайн-разбор пробника №15", "Химия", "chem", "webinar", icon="plus"),
        ]}
    }
    periods.append({"id": "p10", "name": "22 февраля — 14 марта", "days": p10_days})

    # ==========================================
    # ПЕРИОД 11: 15 марта — 4 апреля (Стр 11)
    # ==========================================
    p11_days = {
        "2027-03-15": {"dayName": "ПН", "dayNum": 15, "month": "мар", "items": [
            create_item("p11_15_b1", "Теория №55", "Макроэволюция", "bio", "theory"),
            create_item("p11_15_c1", "Пробник №16", "Химия", "chem", "mock"),
            create_item("p11_15_r1", "Практика №40", "МЕГАВЕБИНАР по пунктуации. Русская рулетка", "rus", "practice"),
            create_item("p11_15_r2", "Пробник №8", "Русский язык", "rus", "mock"),
        ]},
        "2027-03-16": {"dayName": "ВТ", "dayNum": 16, "month": "мар", "items": [
            create_item("p11_16_b1", "Практика №54", "Микроэволюция", "bio", "practice", time="16:00", icon="clock"),
            create_item("p11_16_r1", "Рубежная аттестация №4: Весь тест ЕГЭ, частые ошибки, ловушки ФИПИ", "до 23.03", "rus", "attestation", icon="alert"),
        ]},
        "2027-03-17": {"dayName": "СР", "dayNum": 17, "month": "мар", "items": [
            create_item("p11_17_c1", "Практика №57", "Кислород. Сера.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p11_17_r1", "Теория №61", "1 задание", "rus", "theory"),
        ]},
        "2027-03-18": {"dayName": "ЧТ", "dayNum": 18, "month": "мар", "items": [
            create_item("p11_18_b1", "Практика №55", "Макроэволюция", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-03-19": {"dayName": "ПТ", "dayNum": 19, "month": "мар", "items": [
            create_item("p11_19_c1", "Практика №58", "Азот.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p11_19_r1", "Теория №62", "2 задание", "rus", "theory"),
        ]},
        "2027-03-20": {"dayName": "СБ", "dayNum": 20, "month": "мар", "items": [
            create_item("p11_20_b1", "Эвристика с Аленой", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p11_20_r1", "Практика №41", "Как найти и устранить свои слабые места в тесте и сочинении. Сумасшедшая нарешка заданий 20-21. Веб с экспертом ЕГЭ", "rus", "practice", time="16:00", icon="clock"),
            create_item("p11_20_b2", "Теория №56", "Доказательства (методы) эволюции", "bio", "theory"),
            create_item("p11_20_c1", "Теория №59", "Фосфор.", "chem", "theory"),
            create_item("p11_20_c2", "Теория №60", "Углерод. Кремний.", "chem", "theory"),
        ]},
        "2027-03-21": {"dayName": "ВС", "dayNum": 21, "month": "мар", "items": [
            create_item("p11_21_b1", "Пересдача / Рубежная аттестация №3: Зоология и ботаника", "до 28.03", "bio", "attestation", icon="alert"),
            create_item("p11_21_c1", "Клуб укротителей задач №16", "Задачи 33 и 34.", "chem", "webinar", icon="plus"),
        ]},

        "2027-03-22": {"dayName": "ПН", "dayNum": 22, "month": "мар", "items": [
            create_item("p11_22_b1", "Теория №57", "Возникновение и развитие жизни на Земле", "bio", "theory"),
            create_item("p11_22_r1", "Практика №42", "Айсберг по 3 заданию. Нетиповый вебчик", "rus", "practice"),
            create_item("p11_22_r2", "Теория №63", "3 задание, стили и типы", "rus", "theory"),
        ]},
        "2027-03-23": {"dayName": "ВТ", "dayNum": 23, "month": "мар", "items": [
            create_item("p11_23_b1", "Практика №56", "Доказательства (методы) эволюции", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-03-24": {"dayName": "СР", "dayNum": 24, "month": "мар", "items": [
            create_item("p11_24_c1", "Практика №59", "Фосфор.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p11_24_b1", "Пробник №15", "Биология", "bio", "mock"),
            create_item("p11_24_r1", "Теория №64", "24 задание", "rus", "theory"),
        ]},
        "2027-03-25": {"dayName": "ЧТ", "dayNum": 25, "month": "мар", "items": [
            create_item("p11_25_b1", "Практика №57", "Возникновение и развитие жизни на Земле", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-03-26": {"dayName": "ПТ", "dayNum": 26, "month": "мар", "items": [
            create_item("p11_26_c1", "Практика №60", "Углерод. Кремний.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p11_26_r1", "Теория №65", "25 задание", "rus", "theory"),
        ]},
        "2027-03-27": {"dayName": "СБ", "dayNum": 27, "month": "мар", "items": [
            create_item("p11_27_b1", "Разбор пробника №14 с Асифом", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p11_27_b2", "Теория №58", "Палеонтология и геохронология", "bio", "theory"),
            create_item("p11_27_c1", "Теория №61", "Металлы. Металлы IA и IIA групп. Алюминий и цинк.", "chem", "theory"),
            create_item("p11_27_c2", "Теория №62", "Железо. Хром.", "chem", "theory"),
        ]},
        "2027-03-28": {"dayName": "ВС", "dayNum": 28, "month": "мар", "items": []},

        "2027-03-29": {"dayName": "ПН", "dayNum": 29, "month": "мар", "items": [
            create_item("p11_29_r1", "Практика №43", "Сочинение ЕГЭ Комментарим", "rus", "practice", time="16:00", icon="clock"),
            create_item("p11_29_b1", "Теория №59", "Антропогенез, Правила эволюции", "bio", "theory"),
            create_item("p11_29_c1", "Пробник №17", "Химия", "chem", "mock"),
        ]},
        "2027-03-30": {"dayName": "ВТ", "dayNum": 30, "month": "мар", "items": [
            create_item("p11_30_b1", "Практика №58", "Палеонтология и геохронология", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-03-31": {"dayName": "СР", "dayNum": 31, "month": "мар", "items": [
            create_item("p11_31_c1", "Практика №61", "Металлы. Металлы IA и IIA групп. Алюминий и цинк.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p11_31_r1", "Теория №66", "26 задание", "rus", "theory"),
        ]},
        "2027-04-01": {"dayName": "ЧТ", "dayNum": 1, "month": "апр", "items": [
            create_item("p11_01_b1", "Практика №59", "Антропогенез, Правила эволюции", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-04-02": {"dayName": "ПТ", "dayNum": 2, "month": "апр", "items": [
            create_item("p11_02_c1", "Практика №62", "Железо. Хром.", "chem", "practice"),
            create_item("p11_02_c2", "Зачёт №4 (до 11.04)", "Химия", "chem", "credit", icon="check"),
            create_item("p11_02_r1", "Теория №67", "23 задание", "rus", "theory"),
            create_item("p11_02_r2", "Тест №7", "Русский язык", "rus", "test"),
        ]},
        "2027-04-03": {"dayName": "СБ", "dayNum": 3, "month": "апр", "items": [
            create_item("p11_03_b1", "Эвристика с Аленой", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p11_03_r1", "Практика №44", "Итоговое решение варианта + работа с текстом. Веб с экспертом ЕГЭ", "rus", "practice", time="16:00", icon="clock"),
            create_item("p11_03_b2", "Теория №60", "Экология и экологические факторы", "bio", "theory"),
            create_item("p11_03_c1", "Теория №63", "Марганец. Медь. Серебро.", "chem", "theory"),
        ]},
        "2027-04-04": {"dayName": "ВС", "dayNum": 4, "month": "апр", "items": [
            create_item("p11_04_c1", "Клуб укротителей задач №17", "Задачи 33 и 34.", "chem", "webinar", icon="plus"),
        ]}
    }
    periods.append({"id": "p11", "name": "15 марта — 4 апреля", "days": p11_days})

    # ==========================================
    # ПЕРИОД 12: 5 апреля — 18 апреля (Стр 12)
    # ==========================================
    p12_days = {
        "2027-04-05": {"dayName": "ПН", "dayNum": 5, "month": "апр", "items": [
            create_item("p12_05_b1", "Теория №61", "Экосистема, Пограничный эффект", "bio", "theory"),
        ]},
        "2027-04-06": {"dayName": "ВТ", "dayNum": 6, "month": "апр", "items": [
            create_item("p12_06_b1", "Практика №60", "Экология и экологические факторы", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-04-07": {"dayName": "СР", "dayNum": 7, "month": "апр", "items": [
            create_item("p12_07_c1", "Практика №63", "Марганец. Медь. Серебро.", "chem", "practice", time="16:00", icon="clock"),
            create_item("p12_07_b1", "Пробник №16", "Биология", "bio", "mock"),
        ]},
        "2027-04-08": {"dayName": "ЧТ", "dayNum": 8, "month": "апр", "items": [
            create_item("p12_08_b1", "Практика №61", "Экосистема, Пограничный эффект", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-04-09": {"dayName": "ПТ", "dayNum": 9, "month": "апр", "items": [
            create_item("p12_09_c1", "Обобщающая практика по химии элементов", "Химия", "chem", "practice"),
            create_item("p12_09_c2", "Рубежная аттестация №3 (химия элементов)", "до 16.04", "chem", "attestation", icon="alert"),
        ]},
        "2027-04-10": {"dayName": "СБ", "dayNum": 10, "month": "апр", "items": [
            create_item("p12_10_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.04 ДО 14.04", "general", "payment"),
            create_item("p12_10_b1", "Разбор пробника №15 с Асифом", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p12_10_b2", "Теория №62", "Биосфера, Круговорот азота, Глобальные экологические проблемы и ООПТ", "bio", "theory"),
            create_item("p12_10_c1", "Теория №64", "Задание 24. Задание 25.", "chem", "theory"),
        ]},
        "2027-04-11": {"dayName": "ВС", "dayNum": 11, "month": "апр", "items": [
            create_item("p12_11_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.04 ДО 14.04", "general", "payment"),
            create_item("p12_11_c1", "Онлайн-разбор пробника №17", "Химия", "chem", "webinar", icon="plus"),
        ]},

        "2027-04-12": {"dayName": "ПН", "dayNum": 12, "month": "апр", "items": [
            create_item("p12_12_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.04 ДО 14.04", "general", "payment"),
            create_item("p12_12_b1", "Теория №63", "Адаптации к условиям среды, Экологические стратегии, Биомы", "bio", "theory"),
        ]},
        "2027-04-13": {"dayName": "ВТ", "dayNum": 13, "month": "апр", "items": [
            create_item("p12_13_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.04 ДО 14.04", "general", "payment"),
            create_item("p12_13_b1", "Практика №62", "Биосфера, Круговорот азота, Глобальные экологические проблемы и ООПТ", "bio", "practice", time="16:00", icon="clock"),
        ]},
        "2027-04-14": {"dayName": "СР", "dayNum": 14, "month": "апр", "items": [
            create_item("p12_14_pay", "ОПЛАТА СЛЕДУЮЩЕГО МЕСЯЦА", "С 10.04 ДО 14.04", "general", "payment"),
            create_item("p12_14_c1", "Практика №64", "Задание 24. Задание 25.", "chem", "practice", time="16:00", icon="clock"),
        ]},
        "2027-04-15": {"dayName": "ЧТ", "dayNum": 15, "month": "апр", "items": [
            create_item("p12_15_b1", "Практика №63", "Адаптации к условиям среды, Экологические стратегии, Биомы", "bio", "practice"),
            create_item("p12_15_b2", "Разбор пробника №16 с Асифом (в записи)", "Биология", "bio", "webinar", icon="plus"),
        ]},
        "2027-04-16": {"dayName": "ПТ", "dayNum": 16, "month": "апр", "items": []},
        "2027-04-17": {"dayName": "СБ", "dayNum": 17, "month": "апр", "items": [
            create_item("p12_17_b1", "Эвристика с Аленой", "Биология", "bio", "webinar", time="14:00", icon="plus"),
            create_item("p12_17_b2", "Зачет №4 (до 25.04)", "Биология", "bio", "credit", icon="check"),
        ]},
        "2027-04-18": {"dayName": "ВС", "dayNum": 18, "month": "апр", "items": []}
    }
    periods.append({"id": "p12", "name": "5 апреля — 18 апреля", "days": p12_days})

    return periods

def inject_companion_blocks(periods):
    """
    Applies user rules:
    - To every theory: add 'Тест' block (same subject color)
    - To every practice: add 'Письменное ДЗ' block (same subject color)
    - To every mock: add 'Тест' block (same subject color)
    - To every essay/literature review: add 'Тест' block (rus color)
    """
    stats = {"theories": 0, "practices": 0, "mocks": 0, "reviews": 0, "companions_added": 0}

    for p in periods:
        for date_str, day_data in p["days"].items():
            new_items = []
            for item in day_data["items"]:
                new_items.append(item)
                cat = item.get("category")
                if cat == "theory":
                    stats["theories"] += 1
                    test_item = create_companion_test(item)
                    new_items.append(test_item)
                    stats["companions_added"] += 1
                elif cat == "practice":
                    stats["practices"] += 1
                    hw_item = create_companion_hw(item)
                    new_items.append(hw_item)
                    stats["companions_added"] += 1
                elif cat == "mock":
                    stats["mocks"] += 1
                    # No companion test for mocks as per user instruction
                elif cat == "review":
                    stats["reviews"] += 1
                    test_item = create_companion_test(item)
                    new_items.append(test_item)
                    stats["companions_added"] += 1
            day_data["items"] = new_items

    return periods, stats

def main():
    periods = build_all_periods()
    periods_with_comp, stats = inject_companion_blocks(periods)

    out_dir = r"C:\Users\podko\.gemini\antigravity\scratch\schedule-planner"
    os.makedirs(out_dir, exist_ok=True)

    # Save as JS file with window.COURSE_DATA
    js_content = f"// Auto-generated full course schedule data for ХимБиоРус ЕГЭ\nwindow.COURSE_DATA = {json.dumps(periods_with_comp, ensure_ascii=False, indent=2)};\n"
    
    js_path = os.path.join(out_dir, "schedule_data.js")
    with open(js_path, "w", encoding="utf-8") as f:
        f.write(js_content)

    print(f"Generated {js_path}")
    print("Dataset Stats:")
    print(f"  Periods: {len(periods_with_comp)}")
    print(f"  Theories found: {stats['theories']}")
    print(f"  Practices found: {stats['practices']}")
    print(f"  Mocks found: {stats['mocks']}")
    print(f"  Essay Reviews found: {stats['reviews']}")
    print(f"  Total companion blocks generated: {stats['companions_added']}")

    # Count total blocks across all days
    total_blocks = sum(len(d["items"]) for p in periods_with_comp for d in p["days"].values())
    print(f"  Total blocks in schedule: {total_blocks}")

if __name__ == "__main__":
    main()
