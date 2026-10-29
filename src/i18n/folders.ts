export const folderMessages: Record<string, Record<string, string>> = {
  ru: {
    removeFromRecent: "Убрать из списка",
    removeFromRecentNamed: "Убрать «{name}» из списка",
    folderMissing: "Папка не найдена",
    removedFromRecent: "Убрано из списка. Файлы на диске не изменились.",
    deleteDynastyNamed: "Удалить «{name}»",
    openDynastyFolder: "Открыть папку династии",
    chooseDynastyFolder: "Выбрать место сохранения",
    saveDynastyFolder: "Сохранить в выбранную папку",
    closeDynastyFolder: "Закрыть династию",
    folderHint:
      "Выберите место сохранения — в нём появится папка с названием династии и файл dynasty.json с карточками, связями и фотографиями. Если имя папки занято, к нему добавится номер.",
    folderUnsupported:
      "Этот браузер не поддерживает запись в выбранную папку. Откройте веб-версию в Chrome или Edge по адресу http://localhost:1420/.",
    folderNotEmpty:
      "Файл династии уже существует. Чтобы продолжить работу с ним, используйте «Открыть папку династии».",
    folderConflict:
      "Файл династии изменён другим окном или программой. Перезапись остановлена. Экспортируйте текущую версию и заново откройте папку для сверки изменений.",
    folderFailed:
      "Не удалось открыть или создать династию. Проверьте выбранную папку, файл dynasty.json и разрешение на чтение и запись.",
    folderSaveFailed:
      "Не удалось записать изменения в папку династии. Не закрывайте окно. Проверьте доступ к папке и свободное место, затем повторите сохранение или экспортируйте текущую версию.",
    browserDynasties: "Ранее сохранённые в браузере",
    browserStorage: "Хранилище браузера",
    transferDynasty: "Перенести в папку",
    transferFolderHint:
      "Выберите место сохранения. Приложение создаст в нём папку с названием династии и дальше будет сохранять изменения туда. Запись в браузере останется, пока вы её не удалите.",
    deleteBrowserRecord: "Удалить из браузера",
    deleteBrowserRecordTitle: "Удалить запись «{name}» из браузера?",
    deleteBrowserRecordHint:
      "Запись династии «{name}» будет удалена из памяти браузера. Папки династий на диске не изменятся. Это действие нельзя отменить.",
    importFolderHint:
      "Выберите место сохранения. Приложение создаст в нём отдельную папку с названием импортированной династии и будет сохранять изменения туда.",
    deleteFolderDynastyHint:
      "Будет безвозвратно удалена папка династии «{folder}» целиком, включая всех персонажей, фотографии, связи, корзину и любые другие файлы внутри. Это действие нельзя отменить. Соседние папки и файлы останутся.",
    noDynastyHint:
      "Создайте династию в выбранной папке или откройте папку существующей. Для старого экспортного файла доступен импорт.",
  },
  en: {
    removeFromRecent: "Remove from list",
    removeFromRecentNamed: "Remove “{name}” from the list",
    folderMissing: "Folder not found",
    removedFromRecent: "Removed from the list. Files on disk were not changed.",
    deleteDynastyNamed: "Delete “{name}”",
    openDynastyFolder: "Open dynasty folder",
    chooseDynastyFolder: "Choose save location",
    saveDynastyFolder: "Save to a chosen folder",
    closeDynastyFolder: "Close dynasty",
    folderHint:
      "Choose a save location. A folder named after the dynasty will be created there, with characters, connections and photos in dynasty.json. A number is added if the folder name is taken.",
    folderUnsupported:
      "This browser cannot write to a chosen folder. Open the web app in Chrome or Edge at http://localhost:1420/.",
    folderNotEmpty: "A dynasty file already exists. Use Open dynasty folder to continue editing it.",
    folderConflict:
      "Another window or app changed the dynasty file. Overwriting was stopped. Export your current version, then reopen the folder to compare changes.",
    folderFailed: "Could not open or create the dynasty. Check the folder, dynasty.json and read/write permission.",
    folderSaveFailed:
      "Could not save to the dynasty folder. Keep this window open. Check folder access and free space, then retry or export your current version.",
    browserDynasties: "Previously saved in this browser",
    browserStorage: "Browser storage",
    transferDynasty: "Move to folder",
    transferFolderHint:
      "Choose a save location. The app will create a folder named after the dynasty there and save further changes to it. The browser record stays until you delete it.",
    deleteBrowserRecord: "Delete from browser",
    deleteBrowserRecordTitle: "Delete the record “{name}” from the browser?",
    deleteBrowserRecordHint:
      "The dynasty record “{name}” will be removed from browser storage. Dynasty folders on disk are not changed. This cannot be undone.",
    importFolderHint:
      "Choose a save location. The app will create a separate folder named after the imported dynasty and save future changes there.",
    deleteFolderDynastyHint:
      "The entire dynasty folder “{folder}” will be permanently deleted, including all characters, photos, connections, trash and any other files inside. This cannot be undone. Neighboring folders and files will remain.",
    noDynastyHint:
      "Create a dynasty in a folder of your choice, or open an existing dynasty folder. Older exported files can be imported.",
  },
  de: {
    removeFromRecent: "Aus der Liste entfernen",
    removeFromRecentNamed: "„{name}“ aus der Liste entfernen",
    folderMissing: "Ordner nicht gefunden",
    removedFromRecent: "Aus der Liste entfernt. Die Dateien auf dem Datenträger wurden nicht verändert.",
    deleteDynastyNamed: "„{name}“ löschen",
    openDynastyFolder: "Dynastieordner öffnen",
    chooseDynastyFolder: "Speicherort wählen",
    saveDynastyFolder: "In gewähltem Ordner speichern",
    closeDynastyFolder: "Dynastie schließen",
    folderHint:
      "Wähle einen Speicherort. Dort wird ein Ordner mit dem Namen der Dynastie erstellt; Figuren, Verbindungen und Fotos stehen in dynasty.json. Ist der Ordnername vergeben, wird eine Nummer ergänzt.",
    folderUnsupported:
      "Dieser Browser kann nicht in einen gewählten Ordner schreiben. Öffne die Web-App in Chrome oder Edge unter http://localhost:1420/.",
    folderNotEmpty:
      "Eine Dynastiedatei ist bereits vorhanden. Verwende „Dynastieordner öffnen“, um sie weiterzubearbeiten.",
    folderConflict:
      "Ein anderes Fenster oder Programm hat die Dynastiedatei geändert. Das Überschreiben wurde gestoppt. Exportiere den aktuellen Stand und öffne den Ordner erneut zum Vergleichen.",
    folderFailed:
      "Die Dynastie konnte nicht geöffnet oder erstellt werden. Prüfe Ordner, dynasty.json und Lese- und Schreibrechte.",
    folderSaveFailed:
      "Speichern im Dynastieordner fehlgeschlagen. Lass das Fenster offen. Prüfe Zugriffsrechte und freien Speicher und versuche es erneut oder exportiere den aktuellen Stand.",
    browserDynasties: "Bisher im Browser gespeichert",
    browserStorage: "Browserspeicher",
    transferDynasty: "In Ordner verschieben",
    transferFolderHint:
      "Wählen Sie einen Speicherort. Die App erstellt dort einen Ordner mit dem Namen der Dynastie und speichert weitere Änderungen darin. Der Eintrag im Browser bleibt, bis Sie ihn löschen.",
    deleteBrowserRecord: "Aus dem Browser löschen",
    deleteBrowserRecordTitle: "Eintrag „{name}“ aus dem Browser löschen?",
    deleteBrowserRecordHint:
      "Der Dynastie-Eintrag „{name}“ wird aus dem Browserspeicher entfernt. Dynastie-Ordner auf dem Datenträger bleiben unverändert. Dies kann nicht rückgängig gemacht werden.",
    importFolderHint:
      "Wähle einen Speicherort. Die App erstellt dort einen eigenen Ordner mit dem Namen der importierten Dynastie und speichert Änderungen darin.",
    deleteFolderDynastyHint:
      "Der gesamte Dynastieordner „{folder}“ wird endgültig gelöscht, einschließlich aller Figuren, Fotos, Verbindungen, des Papierkorbs und aller anderen Dateien darin. Dies kann nicht rückgängig gemacht werden. Benachbarte Ordner und Dateien bleiben erhalten.",
    noDynastyHint:
      "Erstelle eine Dynastie in einem gewählten Ordner oder öffne einen bestehenden Dynastieordner. Ältere Exportdateien können importiert werden.",
  },
  fr: {
    removeFromRecent: "Retirer de la liste",
    removeFromRecentNamed: "Retirer « {name} » de la liste",
    folderMissing: "Dossier introuvable",
    removedFromRecent: "Retiré de la liste. Les fichiers sur le disque n’ont pas été modifiés.",
    deleteDynastyNamed: "Supprimer « {name} »",
    openDynastyFolder: "Ouvrir le dossier d’une dynastie",
    chooseDynastyFolder: "Choisir l’emplacement",
    saveDynastyFolder: "Enregistrer dans un dossier choisi",
    closeDynastyFolder: "Fermer la dynastie",
    folderHint:
      "Choisissez un emplacement. Un dossier portant le nom de la dynastie y sera créé, avec les personnages, liens et photos dans dynasty.json. Un numéro sera ajouté si le nom du dossier est déjà utilisé.",
    folderUnsupported:
      "Ce navigateur ne permet pas d’écrire dans un dossier choisi. Ouvrez l’application dans Chrome ou Edge à l’adresse http://localhost:1420/.",
    folderNotEmpty:
      "Un fichier de dynastie existe déjà. Utilisez « Ouvrir le dossier d’une dynastie » pour le modifier.",
    folderConflict:
      "Une autre fenêtre ou application a modifié le fichier. L’écrasement a été arrêté. Exportez la version actuelle, puis rouvrez le dossier pour comparer les modifications.",
    folderFailed:
      "Impossible d’ouvrir ou de créer la dynastie. Vérifiez le dossier, dynasty.json et les droits de lecture et d’écriture.",
    folderSaveFailed:
      "Impossible d’enregistrer dans le dossier. Gardez cette fenêtre ouverte. Vérifiez l’accès et l’espace libre, puis réessayez ou exportez la version actuelle.",
    browserDynasties: "Enregistrées auparavant dans le navigateur",
    browserStorage: "Stockage du navigateur",
    transferDynasty: "Déplacer vers un dossier",
    transferFolderHint:
      "Choisissez un emplacement. L’application y créera un dossier au nom de la dynastie et y enregistrera les modifications suivantes. L’enregistrement du navigateur reste jusqu’à ce que vous le supprimiez.",
    deleteBrowserRecord: "Supprimer du navigateur",
    deleteBrowserRecordTitle: "Supprimer l’enregistrement « {name} » du navigateur ?",
    deleteBrowserRecordHint:
      "L’enregistrement de la dynastie « {name} » sera supprimé du stockage du navigateur. Les dossiers de dynastie sur le disque ne changent pas. Cette action est irréversible.",
    importFolderHint:
      "Choisissez un emplacement. L’application y créera un dossier séparé portant le nom de la dynastie importée et y enregistrera les modifications.",
    deleteFolderDynastyHint:
      "Le dossier de la dynastie « {folder} » sera supprimé définitivement avec tous les personnages, photos, liens, la corbeille et les autres fichiers qu’il contient. Cette action est irréversible. Les dossiers et fichiers voisins seront conservés.",
    noDynastyHint:
      "Créez une dynastie dans le dossier de votre choix ou ouvrez un dossier existant. Les anciens fichiers exportés peuvent être importés.",
  },
  es: {
    removeFromRecent: "Quitar de la lista",
    removeFromRecentNamed: "Quitar «{name}» de la lista",
    folderMissing: "Carpeta no encontrada",
    removedFromRecent: "Quitada de la lista. Los archivos del disco no se han modificado.",
    deleteDynastyNamed: "Eliminar «{name}»",
    openDynastyFolder: "Abrir carpeta de dinastía",
    chooseDynastyFolder: "Elegir ubicación",
    saveDynastyFolder: "Guardar en una carpeta elegida",
    closeDynastyFolder: "Cerrar dinastía",
    folderHint:
      "Elige una ubicación. Se creará una carpeta con el nombre de la dinastía, con personajes, vínculos y fotos en dynasty.json. Si el nombre ya está ocupado, se añadirá un número.",
    folderUnsupported:
      "Este navegador no permite escribir en una carpeta elegida. Abre la aplicación en Chrome o Edge en http://localhost:1420/.",
    folderNotEmpty: "Ya existe un archivo de dinastía. Usa «Abrir carpeta de dinastía» para seguir editándolo.",
    folderConflict:
      "Otra ventana o aplicación ha modificado el archivo. Se ha detenido la sobrescritura. Exporta la versión actual y vuelve a abrir la carpeta para comparar los cambios.",
    folderFailed:
      "No se pudo abrir o crear la dinastía. Comprueba la carpeta, dynasty.json y los permisos de lectura y escritura.",
    folderSaveFailed:
      "No se pudo guardar en la carpeta. Mantén esta ventana abierta. Comprueba el acceso y el espacio libre, y vuelve a intentarlo o exporta la versión actual.",
    browserDynasties: "Guardadas anteriormente en el navegador",
    browserStorage: "Almacenamiento del navegador",
    transferDynasty: "Mover a una carpeta",
    transferFolderHint:
      "Elige una ubicación. La aplicación creará allí una carpeta con el nombre de la dinastía y guardará en ella los cambios siguientes. El registro del navegador se conserva hasta que lo elimines.",
    deleteBrowserRecord: "Eliminar del navegador",
    deleteBrowserRecordTitle: "¿Eliminar el registro «{name}» del navegador?",
    deleteBrowserRecordHint:
      "El registro de la dinastía «{name}» se eliminará del almacenamiento del navegador. Las carpetas de dinastías en el disco no cambian. Esta acción no se puede deshacer.",
    importFolderHint:
      "Elige una ubicación. La aplicación creará una carpeta separada con el nombre de la dinastía importada y guardará los cambios allí.",
    deleteFolderDynastyHint:
      "Se eliminará permanentemente toda la carpeta de la dinastía «{folder}», incluidos personajes, fotos, vínculos, papelera y cualquier otro archivo dentro. Esta acción no se puede deshacer. Las carpetas y archivos vecinos se conservarán.",
    noDynastyHint:
      "Crea una dinastía en la carpeta que elijas o abre una carpeta existente. También puedes importar archivos exportados anteriormente.",
  },
  "pt-BR": {
    removeFromRecent: "Remover da lista",
    removeFromRecentNamed: "Remover “{name}” da lista",
    folderMissing: "Pasta não encontrada",
    removedFromRecent: "Removida da lista. Os arquivos no disco não foram alterados.",
    deleteDynastyNamed: "Excluir “{name}”",
    openDynastyFolder: "Abrir pasta de dinastia",
    chooseDynastyFolder: "Escolher local",
    saveDynastyFolder: "Salvar em uma pasta escolhida",
    closeDynastyFolder: "Fechar dinastia",
    folderHint:
      "Escolha um local. Uma pasta com o nome da dinastia será criada ali, com personagens, vínculos e fotos em dynasty.json. Se o nome já estiver em uso, será acrescentado um número.",
    folderUnsupported:
      "Este navegador não permite gravar em uma pasta escolhida. Abra o aplicativo no Chrome ou Edge em http://localhost:1420/.",
    folderNotEmpty: "Já existe um arquivo de dinastia. Use “Abrir pasta de dinastia” para continuar editando.",
    folderConflict:
      "Outra janela ou aplicativo alterou o arquivo. A substituição foi interrompida. Exporte a versão atual e abra a pasta novamente para comparar as alterações.",
    folderFailed:
      "Não foi possível abrir ou criar a dinastia. Verifique a pasta, dynasty.json e as permissões de leitura e gravação.",
    folderSaveFailed:
      "Não foi possível salvar na pasta. Mantenha esta janela aberta. Verifique o acesso e o espaço livre, depois tente novamente ou exporte a versão atual.",
    browserDynasties: "Salvas anteriormente no navegador",
    browserStorage: "Armazenamento do navegador",
    transferDynasty: "Mover para uma pasta",
    transferFolderHint:
      "Escolha um local. O aplicativo criará ali uma pasta com o nome da dinastia e salvará nela as próximas alterações. O registro do navegador permanece até você excluí-lo.",
    deleteBrowserRecord: "Excluir do navegador",
    deleteBrowserRecordTitle: "Excluir o registro “{name}” do navegador?",
    deleteBrowserRecordHint:
      "O registro da dinastia “{name}” será removido do armazenamento do navegador. As pastas de dinastias no disco não mudam. Esta ação não pode ser desfeita.",
    importFolderHint:
      "Escolha um local. O aplicativo criará uma pasta separada com o nome da dinastia importada e salvará as alterações ali.",
    deleteFolderDynastyHint:
      "A pasta inteira da dinastia “{folder}” será excluída permanentemente, incluindo personagens, fotos, vínculos, lixeira e quaisquer outros arquivos dentro dela. Esta ação não pode ser desfeita. Pastas e arquivos vizinhos serão mantidos.",
    noDynastyHint:
      "Crie uma dinastia em uma pasta escolhida ou abra uma pasta existente. Arquivos exportados anteriormente podem ser importados.",
  },
  "zh-CN": {
    removeFromRecent: "从列表中移除",
    removeFromRecentNamed: "从列表中移除“{name}”",
    folderMissing: "找不到文件夹",
    removedFromRecent: "已从列表中移除。磁盘上的文件没有改动。",
    deleteDynastyNamed: "删除“{name}”",
    openDynastyFolder: "打开家族文件夹",
    chooseDynastyFolder: "选择保存位置",
    saveDynastyFolder: "保存到所选文件夹",
    closeDynastyFolder: "关闭家族",
    folderHint:
      "请选择保存位置。应用将在其中创建以家族命名的文件夹，角色、关系和照片保存在 dynasty.json 中。如果文件夹名称已被使用，将添加编号。",
    folderUnsupported: "此浏览器不支持写入所选文件夹。请在 Chrome 或 Edge 中打开 http://localhost:1420/。",
    folderNotEmpty: "家族文件已存在。请使用“打开家族文件夹”继续编辑。",
    folderConflict: "其他窗口或程序修改了家族文件，覆盖操作已停止。请先导出当前版本，再重新打开文件夹以核对更改。",
    folderFailed: "无法打开或创建家族。请检查文件夹、dynasty.json 文件及读写权限。",
    folderSaveFailed: "无法保存到家族文件夹。请保持窗口打开，检查文件夹权限和可用空间，然后重试或导出当前版本。",
    browserDynasties: "此前保存在浏览器中的家族",
    browserStorage: "浏览器存储",
    transferDynasty: "移到文件夹",
    transferFolderHint:
      "请选择保存位置。应用将在其中创建以家族命名的文件夹，并将之后的更改保存在其中。浏览器中的记录会保留，直到你将其删除。",
    deleteBrowserRecord: "从浏览器删除",
    deleteBrowserRecordTitle: "要从浏览器删除记录“{name}”吗？",
    deleteBrowserRecordHint: "家族记录“{name}”将从浏览器存储中删除。磁盘上的家族文件夹不会改变。此操作无法撤销。",
    importFolderHint: "请选择保存位置。应用将在其中创建以导入家族命名的独立文件夹，并将之后的更改保存在其中。",
    deleteFolderDynastyHint:
      "将永久删除整个家族文件夹“{folder}”，包括所有角色、照片、关系、回收站及其中的其他文件。此操作无法撤销。相邻文件夹和文件将保留。",
    noDynastyHint: "在所选文件夹中创建家族，或打开现有家族文件夹。也可导入之前导出的文件。",
  },
  sr: {
    removeFromRecent: "Уклони са листе",
    removeFromRecentNamed: "Уклони „{name}“ са листе",
    folderMissing: "Фасцикла није пронађена",
    removedFromRecent: "Уклоњено са листе. Датотеке на диску нису промењене.",
    deleteDynastyNamed: "Избриши „{name}“",
    openDynastyFolder: "Отвори фасциклу династије",
    chooseDynastyFolder: "Изабери место чувања",
    saveDynastyFolder: "Сачувај у изабраној фасцикли",
    closeDynastyFolder: "Затвори династију",
    folderHint:
      "Изабери место чувања. У њему ће бити направљена фасцикла са именом династије, са ликовима, везама и фотографијама у dynasty.json. Ако је име заузето, додаће се број.",
    folderUnsupported:
      "Овај прегледач не подржава упис у изабрану фасциклу. Отвори веб-апликацију у Chrome-у или Edge-у на http://localhost:1420/.",
    folderNotEmpty: "Датотека династије већ постоји. Користи „Отвори фасциклу династије“ за наставак уређивања.",
    folderConflict:
      "Други прозор или програм је изменио датотеку. Преписивање је заустављено. Извези тренутну верзију, па поново отвори фасциклу да упоредиш измене.",
    folderFailed:
      "Није могуће отворити или креирати династију. Провери фасциклу, dynasty.json и дозволе за читање и упис.",
    folderSaveFailed:
      "Чување у фасцикли није успело. Не затварај прозор. Провери приступ и слободан простор, па покушај поново или извези тренутну верзију.",
    browserDynasties: "Раније сачуване у прегледачу",
    browserStorage: "Складиште прегледача",
    transferDynasty: "Премести у фасциклу",
    transferFolderHint:
      "Изаберите место чувања. Апликација ће ту направити фасциклу са именом династије и у њу чувати даље измене. Запис у прегледачу остаје док га не обришете.",
    deleteBrowserRecord: "Обриши из прегледача",
    deleteBrowserRecordTitle: "Обрисати запис „{name}” из прегледача?",
    deleteBrowserRecordHint:
      "Запис династије „{name}” биће уклоњен из складишта прегледача. Фасцикле династија на диску се не мењају. Ова радња се не може опозвати.",
    importFolderHint:
      "Изабери место чувања. Апликација ће у њему направити посебну фасциклу са именом увезене династије и чувати измене у њој.",
    deleteFolderDynastyHint:
      "Цела фасцикла династије „{folder}“ биће трајно обрисана, укључујући све ликове, фотографије, везе, корпу и све друге датотеке у њој. Ово се не може опозвати. Суседне фасцикле и датотеке остају.",
    noDynastyHint:
      "Креирај династију у изабраној фасцикли или отвори постојећу фасциклу династије. Старије извезене датотеке могу да се увезу.",
  },
};
