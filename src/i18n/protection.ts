/** Saved versions of dynasty.json and a dynasty open in another window. */
export const protectionMessages: Record<string, Record<string, string>> = {
  ru: {
    chooseVersion: "Выбрать",
    dynastyVersions: "Резервные версии",
    dynastyVersionsHint:
      "Программа сама сохраняет копию dynasty.json не чаще раза в 10 минут и хранит последние 10 в папке backups. Фотографии не копируются: они остаются в папке photos.",
    restoreVersion: "Восстановить",
    restoreVersionConfirm:
      "Восстановить версию от {date}? Текущее состояние тоже сохранится как резервная версия, его можно будет вернуть.",
    versionRestored: "Восстановлена версия от {date}",
    versionRestoreFailed: "Не удалось восстановить версию. Проверьте доступ к папке династии и попробуйте снова.",
    noVersions: "Резервных версий пока нет.",
    dynastyDamagedTitle: "Файл династии повреждён",
    dynastyDamagedHint:
      "Файл dynasty.json не читается. Можно восстановить последнюю исправную резервную версию. Повреждённый файл останется в папке династии под именем dynasty.damaged.json.",
    dynastyDamagedNoVersions:
      "Файл dynasty.json повреждён, а резервных версий нет. Если у вас есть экспортированная копия, откройте её через «Импорт».",
    dynastyOpenElsewhere:
      "Эта династия уже открыта в другом окне или в другой копии программы. Закройте её там и попробуйте снова. Если та программа закрылась с ошибкой, подождите 3 минуты.",
  },
  en: {
    chooseVersion: "Choose",
    dynastyVersions: "Saved versions",
    dynastyVersionsHint:
      "The app keeps a copy of dynasty.json at most every 10 minutes and stores the last 10 in the backups folder. Photos are not copied: they stay in the photos folder.",
    restoreVersion: "Restore",
    restoreVersionConfirm:
      "Restore the version from {date}? The current state is also kept as a saved version, so you can return to it.",
    versionRestored: "Restored the version from {date}",
    versionRestoreFailed: "Could not restore the version. Check access to the dynasty folder and try again.",
    noVersions: "No saved versions yet.",
    dynastyDamagedTitle: "The dynasty file is damaged",
    dynastyDamagedHint:
      "dynasty.json cannot be read. You can restore the last good saved version. The damaged file stays in the dynasty folder as dynasty.damaged.json.",
    dynastyDamagedNoVersions:
      "dynasty.json is damaged and there are no saved versions. If you have an exported copy, open it with Import.",
    dynastyOpenElsewhere:
      "This dynasty is already open in another window or another copy of the app. Close it there and try again. If that app closed with an error, wait 3 minutes.",
  },
  de: {
    chooseVersion: "Auswählen",
    dynastyVersions: "Gespeicherte Versionen",
    dynastyVersionsHint:
      "Die App legt höchstens alle 10 Minuten eine Kopie von dynasty.json an und behält die letzten 10 im Ordner backups. Fotos werden nicht kopiert: Sie bleiben im Ordner photos.",
    restoreVersion: "Wiederherstellen",
    restoreVersionConfirm:
      "Version vom {date} wiederherstellen? Der aktuelle Stand wird ebenfalls als Version gespeichert, du kannst also zu ihm zurück.",
    versionRestored: "Version vom {date} wiederhergestellt",
    versionRestoreFailed:
      "Die Version konnte nicht wiederhergestellt werden. Prüfe den Zugriff auf den Dynastie-Ordner und versuche es erneut.",
    noVersions: "Noch keine gespeicherten Versionen.",
    dynastyDamagedTitle: "Die Dynastie-Datei ist beschädigt",
    dynastyDamagedHint:
      "dynasty.json kann nicht gelesen werden. Du kannst die letzte intakte gespeicherte Version wiederherstellen. Die beschädigte Datei bleibt als dynasty.damaged.json im Dynastie-Ordner.",
    dynastyDamagedNoVersions:
      "dynasty.json ist beschädigt, und es gibt keine gespeicherten Versionen. Wenn du eine exportierte Kopie hast, öffne sie über „Importieren“.",
    dynastyOpenElsewhere:
      "Diese Dynastie ist bereits in einem anderen Fenster oder einer anderen Kopie der App geöffnet. Schließe sie dort und versuche es erneut. Wurde die App mit einem Fehler beendet, warte 3 Minuten.",
  },
  fr: {
    chooseVersion: "Choisir",
    dynastyVersions: "Versions enregistrées",
    dynastyVersionsHint:
      "L’application garde une copie de dynasty.json au plus toutes les 10 minutes et conserve les 10 dernières dans le dossier backups. Les photos ne sont pas copiées : elles restent dans le dossier photos.",
    restoreVersion: "Restaurer",
    restoreVersionConfirm:
      "Restaurer la version du {date} ? L’état actuel est aussi gardé comme version enregistrée : vous pourrez y revenir.",
    versionRestored: "Version du {date} restaurée",
    versionRestoreFailed:
      "Impossible de restaurer la version. Vérifiez l’accès au dossier de la dynastie et réessayez.",
    noVersions: "Aucune version enregistrée pour l’instant.",
    dynastyDamagedTitle: "Le fichier de la dynastie est endommagé",
    dynastyDamagedHint:
      "Impossible de lire dynasty.json. Vous pouvez restaurer la dernière version enregistrée intacte. Le fichier endommagé reste dans le dossier de la dynastie sous le nom dynasty.damaged.json.",
    dynastyDamagedNoVersions:
      "dynasty.json est endommagé et aucune version n’est enregistrée. Si vous avez une copie exportée, ouvrez-la avec « Importer ».",
    dynastyOpenElsewhere:
      "Cette dynastie est déjà ouverte dans une autre fenêtre ou une autre copie de l’application. Fermez-la là-bas et réessayez. Si cette application s’est fermée sur une erreur, attendez 3 minutes.",
  },
  es: {
    chooseVersion: "Elegir",
    dynastyVersions: "Versiones guardadas",
    dynastyVersionsHint:
      "La aplicación guarda una copia de dynasty.json como máximo cada 10 minutos y conserva las 10 últimas en la carpeta backups. Las fotos no se copian: permanecen en la carpeta photos.",
    restoreVersion: "Restaurar",
    restoreVersionConfirm:
      "¿Restaurar la versión del {date}? El estado actual también se guarda como versión, así que podrás volver a él.",
    versionRestored: "Se restauró la versión del {date}",
    versionRestoreFailed:
      "No se pudo restaurar la versión. Comprueba el acceso a la carpeta de la dinastía e inténtalo de nuevo.",
    noVersions: "Todavía no hay versiones guardadas.",
    dynastyDamagedTitle: "El archivo de la dinastía está dañado",
    dynastyDamagedHint:
      "No se puede leer dynasty.json. Puedes restaurar la última versión guardada en buen estado. El archivo dañado queda en la carpeta de la dinastía como dynasty.damaged.json.",
    dynastyDamagedNoVersions:
      "dynasty.json está dañado y no hay versiones guardadas. Si tienes una copia exportada, ábrela con «Importar».",
    dynastyOpenElsewhere:
      "Esta dinastía ya está abierta en otra ventana o en otra copia de la aplicación. Ciérrala allí e inténtalo de nuevo. Si esa aplicación se cerró con un error, espera 3 minutos.",
  },
  "pt-BR": {
    chooseVersion: "Escolher",
    dynastyVersions: "Versões salvas",
    dynastyVersionsHint:
      "O aplicativo guarda uma cópia de dynasty.json no máximo a cada 10 minutos e mantém as 10 últimas na pasta backups. As fotos não são copiadas: elas ficam na pasta photos.",
    restoreVersion: "Restaurar",
    restoreVersionConfirm:
      "Restaurar a versão de {date}? O estado atual também é guardado como versão, então você poderá voltar a ele.",
    versionRestored: "Versão de {date} restaurada",
    versionRestoreFailed:
      "Não foi possível restaurar a versão. Verifique o acesso à pasta da dinastia e tente novamente.",
    noVersions: "Ainda não há versões salvas.",
    dynastyDamagedTitle: "O arquivo da dinastia está danificado",
    dynastyDamagedHint:
      "Não é possível ler dynasty.json. Você pode restaurar a última versão salva em bom estado. O arquivo danificado fica na pasta da dinastia como dynasty.damaged.json.",
    dynastyDamagedNoVersions:
      "dynasty.json está danificado e não há versões salvas. Se você tiver uma cópia exportada, abra-a com “Importar”.",
    dynastyOpenElsewhere:
      "Esta dinastia já está aberta em outra janela ou em outra cópia do aplicativo. Feche-a lá e tente novamente. Se aquele aplicativo fechou com um erro, aguarde 3 minutos.",
  },
  "zh-CN": {
    chooseVersion: "选择",
    dynastyVersions: "已保存的版本",
    dynastyVersionsHint:
      "应用最多每 10 分钟保存一次 dynasty.json 的副本，并在 backups 文件夹中保留最近 10 份。照片不会被复制，它们仍保存在 photos 文件夹中。",
    restoreVersion: "恢复",
    restoreVersionConfirm: "要恢复 {date} 的版本吗？当前状态也会保存为一个版本，之后可以恢复。",
    versionRestored: "已恢复 {date} 的版本",
    versionRestoreFailed: "无法恢复该版本。请检查家族文件夹的访问权限，然后重试。",
    noVersions: "暂无已保存的版本。",
    dynastyDamagedTitle: "家族文件已损坏",
    dynastyDamagedHint:
      "无法读取 dynasty.json。可以恢复最近一份完好的已保存版本。损坏的文件会以 dynasty.damaged.json 的名称保留在家族文件夹中。",
    dynastyDamagedNoVersions: "dynasty.json 已损坏，且没有已保存的版本。如果你有导出的副本，请通过“导入”打开。",
    dynastyOpenElsewhere:
      "此家族已在另一个窗口或另一个应用副本中打开。请先在那里关闭，然后重试。如果那个应用因错误而关闭，请等待 3 分钟。",
  },
  sr: {
    chooseVersion: "Изабери",
    dynastyVersions: "Сачуване верзије",
    dynastyVersionsHint:
      "Апликација чува копију dynasty.json највише једном у 10 минута и задржава последњих 10 у фасцикли backups. Фотографије се не копирају: остају у фасцикли photos.",
    restoreVersion: "Врати",
    restoreVersionConfirm:
      "Вратити верзију од {date}? Тренутно стање се такође чува као верзија, па ћеш моћи да му се вратиш.",
    versionRestored: "Враћена је верзија од {date}",
    versionRestoreFailed: "Враћање верзије није успело. Провери приступ фасцикли династије и покушај поново.",
    noVersions: "Још нема сачуваних верзија.",
    dynastyDamagedTitle: "Датотека династије је оштећена",
    dynastyDamagedHint:
      "Датотека dynasty.json не може да се прочита. Можеш да вратиш последњу исправну сачувану верзију. Оштећена датотека остаје у фасцикли династије као dynasty.damaged.json.",
    dynastyDamagedNoVersions:
      "Датотека dynasty.json је оштећена, а сачуваних верзија нема. Ако имаш извезену копију, отвори је преко „Увоз“.",
    dynastyOpenElsewhere:
      "Ова династија је већ отворена у другом прозору или другој копији апликације. Затвори је тамо и покушај поново. Ако се та апликација затворила због грешке, сачекај 3 минута.",
  },
  // Komi-Permyak wording still needs native-speaker review, as for the rest of the dictionary.
  koi: {
    chooseVersion: "Бӧрйыны",
    dynastyVersions: "Видзӧм вариантъяс",
    dynastyVersionsHint:
      "Программа ачыс видзӧ dynasty.json копия 10 минут чӧжын ӧтчыдысь унджык абу да backups папкаын кольӧ медбӧръя 10. Фотографияэз оз копируйтчӧ: нія кольӧны photos папкаын.",
    restoreVersion: "Бӧр пуктыны",
    restoreVersionConfirm: "Бӧр пуктыны {date} вариантсӧ? Ӧнія вариантыс сідз жӧ видзсяс, сійӧс позяс бӧр пуктыны.",
    versionRestored: "{date} вариантыс бӧр пуктӧм",
    versionRestoreFailed: "Эз вермы бӧр пуктыны вариантсӧ. Видзӧтӧ династия папкаӧ пыран лэдзӧм да пондылӧ выльысь.",
    noVersions: "Видзӧм вариантъяс эшӧ абуӧсь.",
    dynastyDamagedTitle: "Династия файлыс тшыкӧм",
    dynastyDamagedHint:
      "dynasty.json файлсӧ оз позь лыддьыны. Позьӧ бӧр пуктыны медбӧръя бур видзӧм вариант. Тшыкӧм файлыс кольӧ династия папкаын dynasty.damaged.json нимӧн.",
    dynastyDamagedNoVersions:
      "dynasty.json файлыс тшыкӧм, а видзӧм вариантъяс абуӧсь. Экспортируйтӧм копия кӧ эм, восьтӧ сійӧс «Импорт» пыр.",
    dynastyOpenElsewhere:
      "Тайӧ династияыс нин восьтӧм мӧдік окноын нето программаа мӧдік копияын. Пӧдналӧ сійӧс сэтӧн да пондылӧ выльысь. Сэтчӧс программаыс кӧ пӧднасис ошибкаӧн, видзчысьӧ 3 минут.",
  },
};
