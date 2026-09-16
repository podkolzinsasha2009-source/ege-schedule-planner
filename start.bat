@echo off
chcp 65001 >nul
title Интерактивный планировщик ХимБиоРус ЕГЭ
echo Запуск локального сервера планировщика...
cd /d "%~dp0"
python run_planner.py
pause
