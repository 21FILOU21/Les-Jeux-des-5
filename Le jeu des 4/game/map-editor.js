"use strict";

/* ============================================================
   Créateur de maps 2D — données séparées du jeu + runtime
   Étend l'overworld existant; ne duplique ni combat, ni monstres,
   ni objets joueur.
============================================================ */

const MAP_EDITOR_STORAGE_KEY = "lesJeuxDes5.maps.v1";
const MAP_EDITOR_ACTIVE_KEY = "lesJeuxDes5.activeMapId";
const MAP_EDITOR_ASSET_STORE = "mapAssets";
const MAP_EDITOR_MAX_COLS = 120;
const MAP_EDITOR_MAX_ROWS = 120;

let mapEditorMaps = [];
let mapEditorActiveId = null;
let mapEditorRuntime = null;
let mapEditorAssetCache = new Map();
let mapEditorUndo = [];
let mapEditorRedo = [];
let mapEditorTool = "paint";
let mapEditorSelectedTile = null;
let mapEditorActiveLayerId = "terrain";
let mapEditorDragging = false;
let mapEditorPan = null;
let mapEditorTestMode = false;
let mapEditorTestSnapshot = null;
let mapEditorOpenedObjectIds = new Set();

const MAP_EDITOR_DEFAULT_TILES = [
    { id:"grass", name:"Herbe", collision:false, terrainType:"grass", encounters:true, description:"Terrain traversable.", imageKey:null, fallback:"#8fbf6a" },
    { id:"tree", name:"Arbre", collision:true, terrainType:"obstacle", encounters:false, description:"Obstacle infranchissable.", imageKey:null, fallback:"#285a34" },
    { id:"tall-grass", name:"Hautes herbes", collision:false, terrainType:"grass", encounters:true, description:"Zone de rencontres.", imageKey:null, fallback:"#4c8d43" }
];

const MAP_EDITOR_ITEM_CATALOG = [
    { id:"bandage", label:"Bandage" },
    { id:"force", label:"Potion de Force" },
    { id:"armor", label:"Armure" },
    { id:"totem", label:"Totem" }
];

function mapEditorUid(prefix="id") {
    return prefix+"-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,9);
}

function mapEditorClone(value) {
    return structuredClone(value);
}

function mapEditorNormalizeId(value, fallback) {
    const id = String(value || "").trim().toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
        .replace(/[^a-z0-9_-]+/g,"-").replace(/^-+|-+$/g,"");
    return id || fallback;
}

function mapEditorDefaultMap() {
    const cols=Array.isArray(mapData)&&mapData.length?mapData[0].length:30;
    const rows=Array.isArray(mapData)&&mapData.length?mapData.length:20;
    const cells=Array(cols*rows).fill("grass");
    for(let y=0;y<rows;y++) for(let x=0;x<cols;x++) {
        const legacy=Array.isArray(mapData?.[y])?mapData[y][x]:0;
        cells[y*cols+x]=legacy===1?"tree":legacy===2?"tall-grass":"grass";
    }
    return {
        version:1, id:"map-principale", name:"Carte principale", description:"",
        cols, rows, tileSize:16, tileset:["grass","tree","tall-grass"],
        layers:[{id:"terrain",name:"Terrain",visible:true,cells}],
        encounters:[{id:"enc-herbes",name:"Rencontres des hautes herbes",chance:12,tiles:["tall-grass"],monsters:[],minLevel:1,maxLevel:100}],
        spawn:{x:Math.floor(cols/2),y:Math.floor(rows/2)},
        objects:[],
        metadata:{createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}
    };
}

function normalizeMapEditorMap(map) {
    const m=mapEditorClone(map||mapEditorDefaultMap());
    m.version=1;
    m.id=mapEditorNormalizeId(m.id,mapEditorUid("map"));
    m.name=String(m.name||m.id);
    m.cols=Math.max(1,Math.min(MAP_EDITOR_MAX_COLS,Math.floor(Number(m.cols)||30)));
    m.rows=Math.max(1,Math.min(MAP_EDITOR_MAX_ROWS,Math.floor(Number(m.rows)||20)));
    m.tileSize=Math.max(8,Math.min(128,Math.floor(Number(m.tileSize)||16)));
    m.tileset=Array.isArray(m.tileset)?m.tileset.map(String):["grass"];
    m.layers=Array.isArray(m.layers)?m.layers:[];
    if(!m.layers.length)m.layers=[{id:"terrain",name:"Terrain",visible:true,cells:[]}];
    m.layers=m.layers.map((layer,i)=>({
        id:String(layer.id||"layer-"+i),name:String(layer.name||"Calque "+(i+1)),
        visible:layer.visible!==false,
        cells:Array.isArray(layer.cells)?layer.cells.slice(0,m.cols*m.rows):[]
    }));
    for(const layer of m.layers){while(layer.cells.length<m.cols*m.rows)layer.cells.push(m.tileset[0]||"grass");}
    m.encounters=Array.isArray(m.encounters)?m.encounters:[];
    m.objects=Array.isArray(m.objects)?m.objects:[];
    m.spawn=m.spawn&&Number.isInteger(m.spawn.x)&&Number.isInteger(m.spawn.y)?m.spawn:{x:Math.floor(m.cols/2),y:Math.floor(m.rows/2)};
    m.spawn.x=Math.max(0,Math.min(m.cols-1,m.spawn.x));m.spawn.y=Math.max(0,Math.min(m.rows-1,m.spawn.y));
    m.metadata=m.metadata||{};
    return m;
}

function mapEditorLoadMaps(){
    try {
        const raw=localStorage.getItem(MAP_EDITOR_STORAGE_KEY);
        mapEditorMaps=raw?JSON.parse(raw).map(normalizeMapEditorMap):[];
    } catch(e){ console.error("Maps invalides :",e); mapEditorMaps=[]; }
    if(!mapEditorMaps.length) mapEditorMaps=[mapEditorDefaultMap()];
    mapEditorActiveId=localStorage.getItem(MAP_EDITOR_ACTIVE_KEY)||mapEditorMaps[0].id;
    if(!mapEditorMaps.some(m=>m.id===mapEditorActiveId))mapEditorActiveId=mapEditorMaps[0].id;
}

function mapEditorPersist(){
    localStorage.setItem(MAP_EDITOR_STORAGE_KEY,JSON.stringify(mapEditorMaps));
    if(mapEditorActiveId)localStorage.setItem(MAP_EDITOR_ACTIVE_KEY,mapEditorActiveId);
}

function mapEditorCurrent(){return mapEditorMaps.find(m=>m.id===mapEditorActiveId)||mapEditorMaps[0]||null;}

function mapEditorSaveCurrent(){
    const m=mapEditorCurrent(); if(!m)return;
    m.metadata.updatedAt=new Date().toISOString();
    mapEditorPersist();
}

function mapEditorFindTile(id){
    const m=mapEditorCurrent();
    const tileId=String(id);
    if(m&&Array.isArray(m.tileDefinitions)){
        const t=m.tileDefinitions.find(x=>x.id===tileId); if(t)return t;
    }
    return MAP_EDITOR_DEFAULT_TILES.find(x=>x.id===tileId)||null;
}

function mapEditorAllTiles(){
    const m=mapEditorCurrent();
    const custom=Array.isArray(m?.tileDefinitions)?m.tileDefinitions:[];
    const ids=new Set(custom.map(t=>t.id));
    return [...custom,...MAP_EDITOR_DEFAULT_TILES.filter(t=>!ids.has(t.id))];
}

async function mapEditorOpenAssetDb(){
    if(typeof openSaveDatabase!=="function")return null;
    try{return await openSaveDatabase();}catch(e){console.warn("IndexedDB assets maps :",e);return null;}
}

async function mapEditorPutAsset(key,dataUrl){
    const db=await mapEditorOpenAssetDb(); if(!db)return;
    await new Promise((resolve,reject)=>{
        const tx=db.transaction(MAP_EDITOR_ASSET_STORE,"readwrite");
        tx.objectStore(MAP_EDITOR_ASSET_STORE).put(dataUrl,key);
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
    }); db.close(); mapEditorAssetCache.set(key,dataUrl);
}

async function mapEditorGetAsset(key){
    if(!key)return null;
    if(mapEditorAssetCache.has(key))return mapEditorAssetCache.get(key);
    const db=await mapEditorOpenAssetDb();if(!db)return null;
    const value=await new Promise((resolve,reject)=>{
        const tx=db.transaction(MAP_EDITOR_ASSET_STORE,"readonly");
        const req=tx.objectStore(MAP_EDITOR_ASSET_STORE).get(key);
        req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
    });db.close();
    if(value)mapEditorAssetCache.set(key,value);
    return value;
}

async function mapEditorImportImage(file){
    if(!file)throw new Error("Aucun fichier.");
    if(!["image/png","image/jpeg","image/jpg"].includes(file.type))throw new Error("PNG ou JPG uniquement.");
    if(file.size>8*1024*1024)throw new Error("Image trop volumineuse (8 Mo maximum).");
    const dataUrl=await new Promise((resolve,reject)=>{
        const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);
    });
    const image=new Image();
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error("Image invalide."));image.src=dataUrl;});
    const key="asset-"+mapEditorUid("img");
    await mapEditorPutAsset(key,dataUrl);
    return {key,width:image.naturalWidth,height:image.naturalHeight};
}

function mapEditorPushUndo(){
    const m=mapEditorCurrent();if(!m)return;
    mapEditorUndo.push(mapEditorClone(m));if(mapEditorUndo.length>60)mapEditorUndo.shift();mapEditorRedo=[];
}

function mapEditorRestore(snapshot){
    if(!snapshot)return;
    const i=mapEditorMaps.findIndex(m=>m.id===snapshot.id);
    if(i>=0){mapEditorMaps[i]=normalizeMapEditorMap(snapshot);mapEditorActiveId=snapshot.id;mapEditorPersist();mapEditorApplyRuntime();mapEditorRender();}
}

function mapEditorUndoAction(){
    const m=mapEditorCurrent();if(!m||!mapEditorUndo.length)return;
    mapEditorRedo.push(mapEditorClone(m));mapEditorRestore(mapEditorUndo.pop());
}
function mapEditorRedoAction(){
    const m=mapEditorCurrent();if(!m||!mapEditorRedo.length)return;
    mapEditorUndo.push(mapEditorClone(m));mapEditorRestore(mapEditorRedo.pop());
}

function mapEditorTopLayer(){const m=mapEditorCurrent();return m?.layers?.find(l=>l.id===mapEditorActiveLayerId)||m?.layers?.[0]||null;}

function mapEditorApplyRuntime(requestedId){
    const target=requestedId||mapEditorActiveId;
    const m=mapEditorMaps.find(x=>x.id===target)||mapEditorCurrent();
    if(!m)return;
    mapEditorActiveId=m.id;mapEditorActiveLayerId=m.layers.find(l=>l.visible)?.id||m.layers[0]?.id||"terrain";mapEditorPersist();
    mapEditorRuntime=m;
    MAP_COLS=m.cols;MAP_ROWS=m.rows;MAP_WIDTH=MAP_COLS*TILE_SIZE;MAP_HEIGHT=MAP_ROWS*TILE_SIZE;
    WORLD_START_X=m.spawn.x*TILE_SIZE;WORLD_START_Y=m.spawn.y*TILE_SIZE;
    const visibleLayers=m.layers.filter(l=>l.visible!==false);
    worldMap=[];
    for(let y=0;y<m.rows;y++){
        const row=[];
        for(let x=0;x<m.cols;x++){
            let tileId=m.tileset[0]||"grass";
            for(const layer of visibleLayers){
                const candidate=layer.cells?.[y*m.cols+x];
                if(candidate!==null&&candidate!==undefined&&candidate!=="")tileId=candidate;
            }
            row.push(tileId);
        }
        worldMap.push(row);
    }
    while(worldMap.length<m.rows)worldMap.push(Array(m.cols).fill(m.tileset[0]||"grass"));
    if(typeof buildWorldMapCanvas==="function")worldMapCanvas=buildWorldMapCanvas();
    if(worldCanvas){worldCanvas.width=VIEWPORT_WIDTH;worldCanvas.height=VIEWPORT_HEIGHT;}
    if(typeof findNearestWalkablePosition==="function"&&!isWorldWalkablePixel(WORLD_START_X,WORLD_START_Y)){
        const safe=findNearestWalkablePosition(WORLD_START_X,WORLD_START_Y);
        WORLD_START_X=safe.x;WORLD_START_Y=safe.y;
    }
    if(typeof resetOverworldState==="function")resetOverworldState();
}

function loadActiveMapIntoWorld(id){
    if(!mapEditorMaps.length)mapEditorLoadMaps();
    if(id)mapEditorActiveId=id;
    mapEditorApplyRuntime();
}

function drawMapEditorRuntimeTile(ctx,type,S){
    if(typeof type==="number")return false;
    const tile=mapEditorFindTile(type);
    if(!tile)return false;
    ctx.fillStyle=tile.fallback||"#777";ctx.fillRect(0,0,S,S);
    const data=tile.imageKey?mapEditorAssetCache.get(tile.imageKey):null;
    if(data){
        const img=mapEditorRuntimeImages.get(tile.imageKey);
        if(img&&img.complete)ctx.drawImage(img,0,0,S,S);
    } else if(tile.terrainType==="water"){
        ctx.fillStyle="#4b82a5";ctx.fillRect(0,0,S,S);
    } else if(tile.terrainType==="obstacle"){
        ctx.fillStyle="#285a34";ctx.fillRect(0,0,S,S);
        ctx.fillStyle="rgba(255,255,255,.12)";ctx.fillRect(S*.25,S*.2,S*.5,S*.55);
    } else if(tile.terrainType==="grass"){
        ctx.fillStyle="rgba(255,255,255,.06)";ctx.fillRect(0,0,S,S);
    }
    return true;
}
const mapEditorRuntimeImages=new Map();

function drawMapEditorRuntimeObjects(ctx,S){
    const m=mapEditorCurrent(); if(!m)return;
    for(const o of m.objects||[]){
        if(o.type!=="container")continue;
        const key=mapEditorOpenedObjectIds.has(o.id)?o.openImageKey:o.closedImageKey;
        const img=key?mapEditorRuntimeImages.get(key):null;
        const x=o.x*S,y=o.y*S;
        if(img&&img.complete){ctx.drawImage(img,x,y,S,S);}
        else {ctx.fillStyle=o.opened?"#654b2d":"#b87b37";ctx.fillRect(x+S*.12,y+S*.28,S*.76,S*.55);ctx.fillStyle="#e0b34f";ctx.fillRect(x+S*.42,y+S*.44,S*.16,S*.18);}
    }
}

async function mapEditorLoadRuntimeImages(){
    const objectKeys=(mapEditorCurrent()?.objects||[]).flatMap(o=>[o.closedImageKey,o.openImageKey]).filter(Boolean);
    for(const key of objectKeys){
        if(mapEditorRuntimeImages.has(key))continue;
        const data=await mapEditorGetAsset(key);if(!data)continue;
        const img=new Image();img.onload=()=>{mapEditorRuntimeImages.set(key,img);if(typeof buildWorldMapCanvas==="function"){worldMapCanvas=buildWorldMapCanvas();renderWorld();}};img.src=data;
    }
    for(const tile of mapEditorAllTiles()){
        if(!tile.imageKey||mapEditorRuntimeImages.has(tile.imageKey))continue;
        const data=await mapEditorGetAsset(tile.imageKey);if(!data)continue;
        const img=new Image();img.onload=()=>{mapEditorRuntimeImages.set(tile.imageKey,img);if(typeof buildWorldMapCanvas==="function"){worldMapCanvas=buildWorldMapCanvas();renderWorld();}};img.src=data;
    }
}

function isMapEditorRuntimeBlocked(tileId,col,row){
    const tile=mapEditorFindTile(tileId);
    if(tile?.collision)return true;
    const obj=mapEditorCurrent()?.objects?.find(o=>o.x===col&&o.y===row&&o.collision!==false);
    return !!obj;
}

function mapEditorTileHasEncounter(tileId){
    const m=mapEditorCurrent();
    return !!m?.encounters?.some(e=>Array.isArray(e.tiles)&&e.tiles.includes(String(tileId))&&Number(e.chance)>0&&Array.isArray(e.monsters)&&e.monsters.length);
}

function mapEditorWeighted(list){
    const valid=list.filter(e=>e&&Number(e.weight)>0);
    const total=valid.reduce((s,e)=>s+Number(e.weight),0);
    if(!total)return null;
    let r=Math.random()*total;for(const e of valid){r-=Number(e.weight);if(r<=0)return e;}return valid[valid.length-1];
}

function mapEditorResolveMonster(id){
    const pool=state?.contenu?.Monstres||[];
    return pool.find(m=>String(m.Nom||m.id||"")===String(id))||null;
}

function mapEditorPickEncounter(col,row){
    const m=mapEditorCurrent();if(!m)return null;
    const tileId=worldMap[row]?.[col];
    const tileDefinition=mapEditorFindTile(tileId);
    if(tileDefinition && tileDefinition.encounters!==true)return null;

    const tables=m.encounters.filter(e=>Array.isArray(e.tiles)&&e.tiles.includes(String(tileId)));
    for(const table of tables){
        const chance=Math.max(0,Math.min(100,Number(table.chance)||0));
        if(Math.random()*100>=chance)continue;

        const entry=mapEditorWeighted(table.monsters||[]);
        if(!entry)continue;

        const monster=mapEditorResolveMonster(entry.monsterId);
        if(!monster){
            console.error("Rencontre de map : monstre introuvable :",entry.monsterId);
            continue;
        }

        const min=Math.max(1,Number(table.minLevel)||1,Number(entry.minLevel)||1);
        const max=Math.max(min,Number(table.maxLevel)||min,Number(entry.maxLevel)||min);

        return {
            encounterId:table.id||null,
            mapId:m.id,
            monsterId:monster.Nom||monster.id||entry.monsterId,
            monsterName:monster.Nom||monster.name||entry.monsterId,
            level:Math.floor(min+Math.random()*(max-min+1)),
            count:Math.max(1,Math.floor(Number(entry.count||table.count)||1))
        };
    }

    return null;
}

function tryMapEditorEncounter(col,row){
    const result=mapEditorPickEncounter(col,row);
    if(!result)return false;
    stopOverworldMode();
    overworldState.graceDistance=WORLD_GRACE_TILES*TILE_SIZE;
    showWorldDialogue("Un monstre sauvage apparaît !",1400);
    if(typeof runEncounterTransition==="function")runEncounterTransition(result);
    else setTimeout(()=>{if(typeof triggerWildBattle==="function")triggerWildBattle(result);},450);
    return true;
}

function getMapEditorOverworldSaveData(){
    return {mapId:mapEditorActiveId,openedObjectIds:[...mapEditorOpenedObjectIds]};
}

function applyMapEditorOverworldSaveData(data){
    if(data?.mapId)loadActiveMapIntoWorld(data.mapId);
    const m=mapEditorCurrent();if(!m)return;
    const validIds=new Set((m.objects||[]).map(o=>o.id));
    const opened=new Set((Array.isArray(data?.openedObjectIds)?data.openedObjectIds:[]).filter(id=>validIds.has(id)));
    mapEditorOpenedObjectIds=opened;
}

function mapEditorMonsterLevelOverride(monster,level){
    if(!monster)return;
    if(!window.__mapEditorPendingEncounter)return;
    const p=window.__mapEditorPendingEncounter;p.level=level;
}

function mapEditorGrantItem(id,qty){
    qty=Math.max(0,Math.floor(Number(qty)||0));if(!qty)return;
    if(id==="bandage")state.itemBandage+=qty;
    else if(id==="force")state.itemPotionForce+=qty;
    else if(id==="armor")state.itemArmor+=qty;
    else if(id==="totem")state.itemTotem+=qty;
}

function mapEditorOpenObjectAt(col,row){
    const m=mapEditorCurrent();if(!m)return false;
    const playerCol=Math.floor((overworldState.playerX+TILE_SIZE/2)/TILE_SIZE);
    const playerRow=Math.floor((overworldState.playerY+TILE_SIZE/2)/TILE_SIZE);
    if(Math.abs(playerCol-col)+Math.abs(playerRow-row)!==1)return false;
    const obj=m.objects.find(o=>o.x===col&&o.y===row);if(!obj)return false;
    if(obj.type!=="container")return true;
    if(mapEditorOpenedObjectIds.has(obj.id)){showWorldDialogue("Le coffre est déjà ouvert.",1200);return true;}
    mapEditorOpenedObjectIds.add(obj.id);
    const rewards=[];
    for(const entry of obj.lootTable||[]){
        if(Math.random()*100>=Math.max(0,Math.min(100,Number(entry.chance)||0)))continue;
        const min=Math.max(0,Math.floor(Number(entry.min)||0)),max=Math.max(min,Math.floor(Number(entry.max)||min));
        const qty=min+Math.floor(Math.random()*(max-min+1));
        if(qty){mapEditorGrantItem(entry.itemId,qty);rewards.push((MAP_EDITOR_ITEM_CATALOG.find(x=>x.id===entry.itemId)?.label||entry.itemId)+(qty>1?" ×"+qty:""));}
    }
    showWorldDialogue(rewards.length?"Butin : "+rewards.join(", "):"Le coffre est vide.",2200);
    return true;
}

function mapEditorInteract(){
    const col=Math.floor((overworldState.playerX+TILE_SIZE/2)/TILE_SIZE),row=Math.floor((overworldState.playerY+TILE_SIZE/2)/TILE_SIZE);
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]])if(mapEditorOpenObjectAt(col+dx,row+dy))return true;
    return false;
}

function mapEditorValidate(m){
    const errors=[];
    if(!m||typeof m!=="object")return ["Map invalide."];
    if(!Number.isInteger(m.cols)||!Number.isInteger(m.rows)||m.cols<1||m.rows<1||m.cols>MAP_EDITOR_MAX_COLS||m.rows>MAP_EDITOR_MAX_ROWS)errors.push("Dimensions invalides.");
    if(!Array.isArray(m.layers)||m.layers.length===0)errors.push("Aucun calque valide.");
    const ids=new Set(mapEditorAllTiles().map(t=>t.id));
    for(const layer of m.layers||[]){
        if(!Array.isArray(layer.cells)||layer.cells.length!==m.cols*m.rows)errors.push("Nombre de cellules invalide pour le calque "+(layer.name||layer.id||"?")+".");
        for(const cell of layer.cells||[])if(cell!==null&&cell!==""&&!ids.has(String(cell)))errors.push("Référence de tuile inconnue : "+cell);
    }
    if(!m.spawn||!Number.isInteger(m.spawn.x)||!Number.isInteger(m.spawn.y)||m.spawn.x<0||m.spawn.x>=m.cols||m.spawn.y<0||m.spawn.y>=m.rows)errors.push("Spawn hors carte.");
    for(const o of m.objects||[])if(!o.id||!Number.isInteger(o.x)||!Number.isInteger(o.y)||o.x<0||o.x>=m.cols||o.y<0||o.y>=m.rows)errors.push("Objet hors carte ou ID invalide.");
    for(const e of m.encounters||[])for(const x of e.monsters||[])if(!mapEditorResolveMonster(x.monsterId))errors.push("Monstre introuvable : "+x.monsterId);
    return [...new Set(errors)];
}

async function mapEditorExport(){
    const m=mapEditorCurrent();if(!m)return;
    const data=mapEditorClone(m);data.assets={};
    const keys=new Set();
    for(const t of mapEditorAllTiles())if(t.imageKey)keys.add(t.imageKey);
    for(const o of m.objects||[]){if(o.closedImageKey)keys.add(o.closedImageKey);if(o.openImageKey)keys.add(o.openImageKey);}
    for(const key of keys){const asset=await mapEditorGetAsset(key);if(asset)data.assets[key]=asset;}
    const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=(m.id||"map")+".json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),500);
}

function mapEditorImport(file){
    return file.text().then(async text=>{
        const raw=JSON.parse(text);
        const rawErrors=mapEditorValidate(raw);
        if(rawErrors.length)throw new Error(rawErrors.join("\n"));

        const assets=raw.assets||{};
        delete raw.assets;

        for(const [key,dataUrl] of Object.entries(assets)){
            if(typeof dataUrl!=="string"||!dataUrl.startsWith("data:image/"))throw new Error("Image de map invalide : "+key);
            if(dataUrl.length>12*1024*1024)throw new Error("Image de map trop volumineuse : "+key);
            await mapEditorPutAsset(key,dataUrl);
        }

        const data=normalizeMapEditorMap(raw);
        const errors=mapEditorValidate(data);
        if(errors.length)throw new Error(errors.join("\n"));
        if(mapEditorMaps.some(m=>m.id===data.id))data.id=mapEditorNormalizeId(data.id+"-import","map-import");
        mapEditorMaps.push(data);mapEditorActiveId=data.id;mapEditorPersist();mapEditorApplyRuntime();mapEditorRender();mapEditorLoadRuntimeImages();
    });
}

function mapEditorCreateMap(){
    const name=prompt("Nom de la nouvelle map :","Nouvelle map");if(!name)return;
    let id=mapEditorNormalizeId(name,mapEditorUid("map"));
    while(mapEditorMaps.some(m=>m.id===id))id+="-2";
    const m=normalizeMapEditorMap({id,name,cols:30,rows:20,tileSize:16,tileset:["grass","tree"],layers:[{id:"terrain",name:"Terrain",visible:true,cells:Array(600).fill("grass")}],encounters:[],spawn:{x:15,y:10},objects:[]});
    mapEditorMaps.push(m);mapEditorActiveId=id;mapEditorPersist();mapEditorUndo=[];mapEditorRedo=[];mapEditorApplyRuntime();mapEditorRender();
}

function mapEditorDeleteMap(){
    if(mapEditorMaps.length<=1){showToast?.("Impossible","Il faut conserver au moins une map.");return;}
    const m=mapEditorCurrent();if(!m||!confirm("Supprimer « "+m.name+" » ?"))return;
    mapEditorMaps=mapEditorMaps.filter(x=>x.id!==m.id);mapEditorActiveId=mapEditorMaps[0].id;mapEditorPersist();mapEditorApplyRuntime();mapEditorRender();
}

function mapEditorDuplicateMap(){
    const m=mapEditorCurrent();if(!m)return;
    const copy=mapEditorClone(m);copy.id=mapEditorNormalizeId(m.id+"-copie",mapEditorUid("map"));copy.name=m.name+" (copie)";
    mapEditorMaps.push(copy);mapEditorActiveId=copy.id;mapEditorPersist();mapEditorApplyRuntime();mapEditorRender();
}

function mapEditorCellFromEvent(event){
    const canvas=document.getElementById("map-editor-canvas");if(!canvas)return null;
    const r=canvas.getBoundingClientRect();const zoom=Number(canvas.dataset.zoom)||2;
    const x=(event.clientX-r.left-canvas.width/2)/zoom+(Number(canvas.dataset.panX)||0);
    const y=(event.clientY-r.top-canvas.height/2)/zoom+(Number(canvas.dataset.panY)||0);
    const m=mapEditorCurrent();return {col:Math.floor(x/m.tileSize),row:Math.floor(y/m.tileSize)};
}

function mapEditorPaintAt(event){
    const m=mapEditorCurrent();const layer=mapEditorTopLayer();if(!m||!layer)return;
    const cell=mapEditorCellFromEvent(event);if(!cell||cell.col<0||cell.row<0||cell.col>=m.cols||cell.row>=m.rows)return;
    const index=cell.row*m.cols+cell.col;
    const next=mapEditorTool==="erase"?null:mapEditorSelectedTile;
    if(mapEditorTool==="spawn"){mapEditorPushUndo();m.spawn={x:cell.col,y:cell.row};mapEditorTool="paint";mapEditorSaveCurrent();mapEditorRender();return;}
    if(mapEditorTool==="eyedropper"){mapEditorSelectedTile=layer.cells[index];mapEditorTool="paint";mapEditorRender();return;}
    if(mapEditorTool==="fill"){
        mapEditorPushUndo();const target=layer.cells[index];const replacement=mapEditorSelectedTile;if(target!==replacement){for(let i=0;i<layer.cells.length;i++)if(layer.cells[i]===target)layer.cells[i]=replacement;}mapEditorTool="paint";mapEditorSaveCurrent();mapEditorRender();return;
    }
    if(next===null){
        if(layer.cells[index]===undefined)return;
        layer.cells[index]=layer.id==="terrain"?(m.tileset[0]||"grass"):null;
    }
    else {if(!m.tileset.includes(next))m.tileset.push(next);layer.cells[index]=next;}
    mapEditorSaveCurrent();mapEditorRender();
}


function mapEditorResize(){
    const m=mapEditorCurrent();if(!m)return;
    const cols=Math.max(1,Math.min(MAP_EDITOR_MAX_COLS,Number(prompt("Largeur (cases) :",m.cols))||m.cols));
    const rows=Math.max(1,Math.min(MAP_EDITOR_MAX_ROWS,Number(prompt("Hauteur (cases) :",m.rows))||m.rows));
    if(cols===m.cols&&rows===m.rows)return;
    mapEditorPushUndo();
    for(const layer of m.layers){const next=Array(cols*rows).fill(m.tileset[0]||"grass");for(let y=0;y<Math.min(rows,m.rows);y++)for(let x=0;x<Math.min(cols,m.cols);x++)next[y*cols+x]=layer.cells[y*m.cols+x];layer.cells=next;}
    m.cols=cols;m.rows=rows;m.spawn.x=Math.min(cols-1,m.spawn.x);m.spawn.y=Math.min(rows-1,m.spawn.y);
    m.objects=(m.objects||[]).filter(o=>o.x<cols&&o.y<rows);mapEditorSaveCurrent();mapEditorApplyRuntime();mapEditorRender();
}
function mapEditorAddLayer(){
    const m=mapEditorCurrent();if(!m)return;
    const name=prompt("Nom du nouveau calque :","Décor");if(!name)return;
    mapEditorPushUndo();m.layers.push({id:mapEditorNormalizeId(name,mapEditorUid("layer")),name,visible:true,cells:Array(m.cols*m.rows).fill(null)});mapEditorSaveCurrent();mapEditorRender();
}
function mapEditorOpenEncounterForm(){
    const m=mapEditorCurrent();if(!m)return;
    const first=m.encounters?.[0]||{id:mapEditorUid("enc"),name:"Zone de rencontres",chance:12,tiles:[mapEditorSelectedTile||"tall-grass"],monsters:[],minLevel:1,maxLevel:10};
    const monsterOptions=(state.contenu?.Monstres||[]).map(x=>String(x.Nom||"")).filter(Boolean);
    const tileOptions=mapEditorAllTiles().map(x=>'<option value="'+x.id+'" '+(first.tiles?.includes(x.id)?"selected":"")+'>'+x.name+'</option>').join("");
    const monsterRows=(first.monsters||[]).map((e,i)=>'<div class="me-loot-row"><select data-enc-monster="'+i+'">'+monsterOptions.map(n=>'<option '+(n===e.monsterId?"selected":"")+'>'+n+'</option>').join("")+'</select><input type="number" min="1" data-enc-weight="'+i+'" value="'+(e.weight??1)+'"><input type="number" min="1" data-enc-min="'+i+'" value="'+(e.minLevel??first.minLevel??1)+'"><input type="number" min="1" data-enc-max="'+i+'" value="'+(e.maxLevel??first.maxLevel??10)+'"><button type="button" data-enc-del="'+i+'">×</button></div>').join("");
    mapEditorDialog('<div class="map-editor-dialog"><h3>Table de rencontres</h3><label>Nom<input id="me-e-name" value="'+first.name+'"></label><label>Chance par déclenchement (%)<input id="me-e-chance" type="number" min="0" max="100" value="'+first.chance+'"></label><label>Cases autorisées (Ctrl/Cmd pour plusieurs)<select id="me-e-tiles" multiple>'+tileOptions+'</select></label><label>Niveau min<input id="me-e-min" type="number" min="1" value="'+first.minLevel+'"></label><label>Niveau max<input id="me-e-max" type="number" min="1" value="'+first.maxLevel+'"></label><h4>Monstres pondérés</h4><div id="me-e-monsters">'+monsterRows+'</div><button id="me-e-add" class="secondary-button">+ Monstre</button><div class="dev-form-actions"><button id="me-e-save" class="primary-button">Enregistrer</button><button id="me-e-cancel" class="secondary-button">Annuler</button></div></div>');
    const box=document.getElementById("me-e-monsters");
    document.getElementById("me-e-add").onclick=()=>{const i=box.children.length;const d=document.createElement("div");d.className="me-loot-row";d.innerHTML='<select data-enc-monster="'+i+'">'+monsterOptions.map(n=>'<option>'+n+'</option>').join("")+'</select><input type="number" min="1" data-enc-weight="'+i+'" value="1"><input type="number" min="1" data-enc-min="'+i+'" value="'+first.minLevel+'"><input type="number" min="1" data-enc-max="'+i+'" value="'+first.maxLevel+'"><button type="button">×</button>';d.querySelector("button").onclick=()=>d.remove();box.appendChild(d);};
    box.querySelectorAll("button[data-enc-del]").forEach(b=>b.onclick=()=>b.parentElement.remove());
    document.getElementById("me-e-cancel").onclick=mapEditorCloseDialog;
    document.getElementById("me-e-save").onclick=()=>{
        const selected=[...document.getElementById("me-e-tiles").selectedOptions].map(x=>x.value);
        const m2=mapEditorCurrent();m2.encounters=Array.isArray(m2.encounters)?m2.encounters:[];
        let target=m2.encounters.find(x=>x.id===first.id);if(!target){target=mapEditorClone(first);m2.encounters.push(target);}
        target.name=document.getElementById("me-e-name").value||"Rencontres";target.chance=Number(document.getElementById("me-e-chance").value)||0;target.tiles=selected;target.minLevel=Math.max(1,Number(document.getElementById("me-e-min").value)||1);target.maxLevel=Math.max(target.minLevel,Number(document.getElementById("me-e-max").value)||target.minLevel);
        target.monsters=[...box.children].map(row=>({monsterId:row.querySelector("[data-enc-monster]")?.value,weight:Number(row.querySelector("[data-enc-weight]")?.value)||0,minLevel:Number(row.querySelector("[data-enc-min]")?.value)||target.minLevel,maxLevel:Number(row.querySelector("[data-enc-max]")?.value)||target.maxLevel})).filter(x=>x.monsterId&&x.weight>0);
        mapEditorSaveCurrent();mapEditorCloseDialog();
    };
}

function mapEditorRender(){
    const layerSelect=document.getElementById("me-layer-select"),cm=mapEditorCurrent();if(layerSelect&&cm){layerSelect.innerHTML=(cm.layers||[]).map(l=>'<option value="'+l.id+'" '+(l.id===mapEditorActiveLayerId?"selected":"")+'>'+l.name+'</option>').join("");layerSelect.onchange=()=>{mapEditorActiveLayerId=layerSelect.value;mapEditorRender();};}
    const root=document.getElementById("map-editor-root");if(!root)return;
    const m=mapEditorCurrent();if(!m)return;
    const canvas=document.getElementById("map-editor-canvas");const ctx=canvas.getContext("2d");
    const zoom=Number(canvas.dataset.zoom)||2,panX=Number(canvas.dataset.panX)||0,panY=Number(canvas.dataset.panY)||0;
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate(canvas.width/2-panX*zoom,canvas.height/2-panY*zoom);ctx.scale(zoom,zoom);
    const tileMap=new Map(mapEditorAllTiles().map(t=>[t.id,t]));
    const layer=mapEditorTopLayer();
    for(let y=0;y<m.rows;y++)for(let x=0;x<m.cols;x++){
        const id=layer.cells[y*m.cols+x];const tile=tileMap.get(id)||MAP_EDITOR_DEFAULT_TILES[0];
        ctx.fillStyle=tile.fallback||"#777";ctx.fillRect(x*m.tileSize,y*m.tileSize,m.tileSize,m.tileSize);
        const img=tile.imageKey?mapEditorRuntimeImages.get(tile.imageKey):null;
        if(img)ctx.drawImage(img,x*m.tileSize,y*m.tileSize,m.tileSize,m.tileSize);
        if(mapEditorSelectedTile===id) {ctx.strokeStyle="#fff";ctx.lineWidth=1/zoom;ctx.strokeRect(x*m.tileSize+.5,y*m.tileSize+.5,m.tileSize-1,m.tileSize-1);}
    }
    ctx.strokeStyle="rgba(255,255,255,.18)";ctx.lineWidth=1/zoom;
    for(let x=0;x<=m.cols;x++){ctx.beginPath();ctx.moveTo(x*m.tileSize,0);ctx.lineTo(x*m.tileSize,m.rows*m.tileSize);ctx.stroke();}
    for(let y=0;y<=m.rows;y++){ctx.beginPath();ctx.moveTo(0,y*m.tileSize);ctx.lineTo(m.cols*m.tileSize,y*m.tileSize);ctx.stroke();}
    ctx.fillStyle="#ffd54a";ctx.fillRect(m.spawn.x*m.tileSize+m.tileSize*.25,m.spawn.y*m.tileSize+m.tileSize*.25,m.tileSize*.5,m.tileSize*.5);
    for(const o of m.objects){ctx.fillStyle=mapEditorOpenedObjectIds.has(o.id)?"#6b5530":"#b9823d";ctx.fillRect(o.x*m.tileSize+2,o.y*m.tileSize+2,m.tileSize-4,m.tileSize-4);}
    ctx.restore();
    root.querySelector("#map-editor-current-name").textContent=m.name+" · "+m.cols+"×"+m.rows;
}

function mapEditorRenderList(){
    const list=document.getElementById("map-editor-list");if(!list)return;
    list.innerHTML=mapEditorMaps.map(m=>`<button type="button" class="secondary-button map-editor-map-item ${m.id===mapEditorActiveId?"active":""}" data-map-id="${m.id}">${m.name} <small>${m.cols}×${m.rows}</small></button>`).join("");
    list.querySelectorAll("[data-map-id]").forEach(b=>b.onclick=()=>{mapEditorActiveId=b.dataset.mapId;mapEditorUndo=[];mapEditorRedo=[];mapEditorApplyRuntime();mapEditorRender();mapEditorRenderList();});
}

function mapEditorRenderTiles(){
    const list=document.getElementById("map-editor-tiles");if(!list)return;
    list.innerHTML=mapEditorAllTiles().map(t=>'<button type="button" class="map-editor-tile '+(mapEditorSelectedTile===t.id?"selected":"")+'" data-tile="'+t.id+'"><span style="background:'+(t.fallback||"#777")+'"></span>'+t.name+'</button>').join("");
    list.querySelectorAll("[data-tile]").forEach(b=>b.onclick=()=>{mapEditorSelectedTile=b.dataset.tile;mapEditorTool="paint";mapEditorRenderTiles();mapEditorRender();});
}

function mapEditorOpenTileForm(existing=null){
    const t=existing||{id:"",name:"",collision:false,terrainType:"grass",encounters:false,description:"",fallback:"#8fbf6a",imageKey:null};
    const html='<div class="map-editor-dialog"><h3>'+(existing?"Modifier":"Créer")+' une tuile</h3>'+
    '<label>ID<input id="me-t-id" value="'+(t.id||"")+'" placeholder="ex: chemin"></label>'+
    '<label>Nom<input id="me-t-name" value="'+(t.name||"")+'"></label>'+
    '<label>Type de terrain<select id="me-t-terrain"><option>grass</option><option>water</option><option>sand</option><option>road</option><option>obstacle</option></select></label>'+
    '<label><input type="checkbox" id="me-t-collision" '+(t.collision?"checked":"")+'> Collision</label>'+
    '<label><input type="checkbox" id="me-t-encounters" '+(t.encounters?"checked":"")+'> Autoriser les rencontres</label>'+
    '<label>Couleur de secours<input type="color" id="me-t-fallback" value="'+(t.fallback||"#8fbf6a")+'"></label>'+
    '<label>Description<textarea id="me-t-desc">'+(t.description||"")+'</textarea></label>'+
    '<label>Image PNG/JPG<input type="file" id="me-t-image" accept="image/png,image/jpeg"></label>'+
    '<div class="dev-form-actions"><button id="me-t-save" class="primary-button">Enregistrer</button><button id="me-t-cancel" class="secondary-button">Annuler</button></div></div>';
    mapEditorDialog(html);
    document.getElementById("me-t-cancel").onclick=mapEditorCloseDialog;
    document.getElementById("me-t-save").onclick=async()=>{
        try{
            const id=mapEditorNormalizeId(document.getElementById("me-t-id").value,"tile");
            const name=document.getElementById("me-t-name").value.trim()||id;
            if(!/^[a-z0-9_-]+$/.test(id))throw new Error("ID invalide.");
            const m=mapEditorCurrent();m.tileDefinitions=Array.isArray(m.tileDefinitions)?m.tileDefinitions:[];
            let target=m.tileDefinitions.find(x=>x.id===id);
            if(!target){target={id};m.tileDefinitions.push(target);}
            Object.assign(target,{id,name,collision:document.getElementById("me-t-collision").checked,terrainType:document.getElementById("me-t-terrain").value,encounters:document.getElementById("me-t-encounters").checked,fallback:document.getElementById("me-t-fallback").value,description:document.getElementById("me-t-desc").value});
            const file=document.getElementById("me-t-image").files[0];if(file){const a=await mapEditorImportImage(file);target.imageKey=a.key;}
            if(!m.tileset.includes(id))m.tileset.push(id);
            mapEditorSaveCurrent();mapEditorCloseDialog();mapEditorRenderTiles();mapEditorRender();mapEditorLoadRuntimeImages();
        }catch(e){alert(e.message);}
    };
}

function mapEditorOpenChestForm(existing=null){
    const o=existing||{id:mapEditorUid("chest"),type:"container",name:"Coffre",x:0,y:0,collision:true,opened:false,closedImageKey:null,openImageKey:null,lootTable:[]};
    const rows=(o.lootTable||[]).map((e,i)=>'<div class="me-loot-row"><select data-loot-item="'+i+'">'+MAP_EDITOR_ITEM_CATALOG.map(x=>'<option value="'+x.id+'" '+(x.id===e.itemId?"selected":"")+'>'+x.label+'</option>').join("")+'</select><input type="number" min="0" max="100" data-loot-chance="'+i+'" value="'+(e.chance??100)+'"><input type="number" min="1" data-loot-min="'+i+'" value="'+(e.min??1)+'"><input type="number" min="1" data-loot-max="'+i+'" value="'+(e.max??1)+'"><button type="button" data-loot-del="'+i+'">×</button></div>').join("");
    const html='<div class="map-editor-dialog"><h3>Coffre / conteneur</h3><label>ID<input id="me-c-id" value="'+o.id+'"></label><label>Nom<input id="me-c-name" value="'+o.name+'"></label><label>X<input id="me-c-x" type="number" value="'+o.x+'"></label><label>Y<input id="me-c-y" type="number" value="'+o.y+'"></label><label><input id="me-c-collision" type="checkbox" '+(o.collision!==false?"checked":"")+'> Collision</label><label>Image fermée PNG/JPG<input id="me-c-closed" type="file" accept="image/png,image/jpeg"></label><label>Image ouverte PNG/JPG<input id="me-c-open" type="file" accept="image/png,image/jpeg"></label><h4>Table de butin</h4><div id="me-loot">'+rows+'</div><button type="button" id="me-loot-add" class="secondary-button">+ Récompense</button><div class="dev-form-actions"><button id="me-c-save" class="primary-button">Enregistrer</button><button id="me-c-cancel" class="secondary-button">Annuler</button></div></div>';
    mapEditorDialog(html);
    const loot=document.getElementById("me-loot");
    document.getElementById("me-loot-add").onclick=()=>{const div=document.createElement("div");div.className="me-loot-row";div.innerHTML='<select data-loot-item="'+loot.children.length+'">'+MAP_EDITOR_ITEM_CATALOG.map(x=>'<option value="'+x.id+'">'+x.label+'</option>').join("")+'</select><input type="number" min="0" max="100" data-loot-chance="'+loot.children.length+'" value="100"><input type="number" min="1" data-loot-min="'+loot.children.length+'" value="1"><input type="number" min="1" data-loot-max="'+loot.children.length+'" value="1"><button type="button">×</button>';div.querySelector("button").onclick=()=>div.remove();loot.appendChild(div);};
    loot.querySelectorAll("button[data-loot-del]").forEach(b=>b.onclick=()=>b.parentElement.remove());
    document.getElementById("me-c-cancel").onclick=mapEditorCloseDialog;
    document.getElementById("me-c-save").onclick=async()=>{
        const m=mapEditorCurrent();m.objects=Array.isArray(m.objects)?m.objects:[];let target=m.objects.find(x=>x.id===o.id);if(!target){target=mapEditorClone(o);m.objects.push(target);}
        target.id=mapEditorNormalizeId(document.getElementById("me-c-id").value,o.id);target.name=document.getElementById("me-c-name").value;target.x=Math.max(0,Math.min(m.cols-1,Number(document.getElementById("me-c-x").value)||0));target.y=Math.max(0,Math.min(m.rows-1,Number(document.getElementById("me-c-y").value)||0));target.collision=document.getElementById("me-c-collision").checked;target.type="container";target.opened=!!target.opened;
        const closedFile=document.getElementById("me-c-closed").files[0],openFile=document.getElementById("me-c-open").files[0];
        if(closedFile)target.closedImageKey=(await mapEditorImportImage(closedFile)).key;
        if(openFile)target.openImageKey=(await mapEditorImportImage(openFile)).key;
        target.lootTable=[...loot.children].map(row=>({itemId:row.querySelector("[data-loot-item]")?.value,chance:Number(row.querySelector("[data-loot-chance]")?.value)||0,min:Number(row.querySelector("[data-loot-min]")?.value)||1,max:Number(row.querySelector("[data-loot-max]")?.value)||1})).filter(x=>x.itemId);
        mapEditorSaveCurrent();mapEditorCloseDialog();mapEditorRender();
    };
}

function mapEditorDialog(inner){
    let d=document.getElementById("map-editor-dialog");if(!d){d=document.createElement("div");d.id="map-editor-dialog";document.body.appendChild(d);}
    d.className="map-editor-dialog-wrap";d.innerHTML=inner;
}
function mapEditorCloseDialog(){const d=document.getElementById("map-editor-dialog");if(d)d.remove();}

function mapEditorRender(){
    const root=document.getElementById("map-editor-root");if(!root)return;
    mapEditorRenderList();mapEditorRenderTiles();
    const m=mapEditorCurrent(),canvas=document.getElementById("map-editor-canvas");if(!m||!canvas)return;
    const ctx=canvas.getContext("2d"),zoom=Number(canvas.dataset.zoom)||2,panX=Number(canvas.dataset.panX)||0,panY=Number(canvas.dataset.panY)||0;
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.save();ctx.translate(canvas.width/2-panX*zoom,canvas.height/2-panY*zoom);ctx.scale(zoom,zoom);
    const tileMap=new Map(mapEditorAllTiles().map(t=>[t.id,t])),layer=mapEditorTopLayer();
    for(let y=0;y<m.rows;y++)for(let x=0;x<m.cols;x++){const id=layer.cells[y*m.cols+x],t=tileMap.get(id)||MAP_EDITOR_DEFAULT_TILES[0];ctx.fillStyle=t.fallback||"#777";ctx.fillRect(x*m.tileSize,y*m.tileSize,m.tileSize,m.tileSize);const img=t.imageKey?mapEditorRuntimeImages.get(t.imageKey):null;if(img)ctx.drawImage(img,x*m.tileSize,y*m.tileSize,m.tileSize,m.tileSize);if(mapEditorSelectedTile===id){ctx.strokeStyle="#fff";ctx.lineWidth=1/zoom;ctx.strokeRect(x*m.tileSize+.5,y*m.tileSize+.5,m.tileSize-1,m.tileSize-1);}}
    ctx.strokeStyle="rgba(255,255,255,.18)";ctx.lineWidth=1/zoom;for(let x=0;x<=m.cols;x++){ctx.beginPath();ctx.moveTo(x*m.tileSize,0);ctx.lineTo(x*m.tileSize,m.rows*m.tileSize);ctx.stroke();}for(let y=0;y<=m.rows;y++){ctx.beginPath();ctx.moveTo(0,y*m.tileSize);ctx.lineTo(m.cols*m.tileSize,y*m.tileSize);ctx.stroke();}
    ctx.fillStyle="#ffd54a";ctx.fillRect(m.spawn.x*m.tileSize+m.tileSize*.25,m.spawn.y*m.tileSize+m.tileSize*.25,m.tileSize*.5,m.tileSize*.5);for(const o of m.objects){ctx.fillStyle=o.opened?"#6b5530":"#b9823d";ctx.fillRect(o.x*m.tileSize+2,o.y*m.tileSize+2,m.tileSize-4,m.tileSize-4);}
    ctx.restore();root.querySelector("#map-editor-current-name").textContent=m.name+" · "+m.cols+"×"+m.rows;
}

function mapEditorBuildUi(){
    if(document.getElementById("map-editor-root"))return;
    const wrap=document.createElement("div");wrap.id="map-editor-root";wrap.className="save-menu map-editor-shell hidden";
    wrap.innerHTML='<div class="save-menu-content map-editor-content"><div class="save-menu-header"><div><span class="eyebrow">OUTIL DÉVELOPPEUR</span><h2>Créateur de Map</h2><p id="map-editor-current-name"></p></div><button id="map-editor-close" class="close-button">×</button></div><div class="map-editor-toolbar"><button id="me-new" class="primary-button">Nouvelle</button><button id="me-dup" class="secondary-button">Dupliquer</button><button id="me-del" class="secondary-button">Supprimer</button><button id="me-import" class="secondary-button">Importer JSON</button><button id="me-export" class="secondary-button">Exporter JSON</button><button id="me-undo" class="secondary-button">↶</button><button id="me-redo" class="secondary-button">↷</button><button id="me-test" class="secondary-button">Tester</button><button id="me-resize" class="secondary-button">Dimensions</button><select id="me-layer-select" title="Calque actif"></select><button id="me-layer" class="secondary-button">+ Calque</button><button id="me-encounter" class="secondary-button">Rencontres</button></div><div class="map-editor-layout"><aside><h3>Maps</h3><div id="map-editor-list"></div><h3>Tuiles</h3><div id="map-editor-tiles"></div><button id="me-new-tile" class="secondary-button">+ Tuile</button><button id="me-chest" class="secondary-button">+ Coffre</button><h3>Outils</h3><div class="map-editor-tools"><button data-tool="paint">Pinceau</button><button data-tool="erase">Gomme</button><button data-tool="eyedropper">Pipette</button><button data-tool="fill">Remplir</button><button data-tool="spawn">Spawn</button></div></aside><main><canvas id="map-editor-canvas" width="1100" height="650" data-zoom="2" data-pan-x="0" data-pan-y="0"></canvas><div class="map-editor-hint">Clic gauche : placer · clic droit : effacer · glisser : peindre · molette : zoom · clic molette : déplacer</div></main></div><input id="map-editor-import-file" type="file" accept=".json,application/json" hidden></div>';
    document.body.appendChild(wrap);
    document.getElementById("map-editor-close").onclick=mapEditorClose;
    document.getElementById("me-new").onclick=mapEditorCreateMap;document.getElementById("me-dup").onclick=mapEditorDuplicateMap;document.getElementById("me-del").onclick=mapEditorDeleteMap;document.getElementById("me-import").onclick=()=>document.getElementById("map-editor-import-file").click();document.getElementById("me-export").onclick=mapEditorExport;document.getElementById("me-undo").onclick=mapEditorUndoAction;document.getElementById("me-redo").onclick=mapEditorRedoAction;
    document.getElementById("me-resize").onclick=mapEditorResize;document.getElementById("me-layer").onclick=mapEditorAddLayer;document.getElementById("me-encounter").onclick=mapEditorOpenEncounterForm;
    document.getElementById("me-test").onclick=()=>{
        mapEditorTestMode=true;
        mapEditorTestSnapshot={map:mapEditorClone(mapEditorCurrent()),opened:new Set(mapEditorOpenedObjectIds)};
        const r=document.getElementById("map-editor-root");if(r)r.classList.add("hidden");
        if(typeof startOverworldMode==="function")startOverworldMode();
    };
    document.getElementById("me-new-tile").onclick=()=>mapEditorOpenTileForm();
    document.getElementById("me-chest").onclick=()=>mapEditorOpenChestForm();
    document.querySelectorAll(".map-editor-tools [data-tool]").forEach(b=>b.onclick=()=>{mapEditorTool=b.dataset.tool;});
    document.getElementById("map-editor-import-file").onchange=e=>{const f=e.target.files[0];if(f)mapEditorImport(f).catch(err=>alert(err.message));e.target.value="";};
    const canvas=document.getElementById("map-editor-canvas");
    canvas.oncontextmenu=e=>e.preventDefault();
    canvas.onmousedown=e=>{if(e.button===2){mapEditorPushUndo();mapEditorTool="erase";mapEditorDragging=true;mapEditorPaintAt(e);return;}if(e.button===1){mapEditorPan={x:e.clientX,y:e.clientY,px:Number(canvas.dataset.panX)||0,py:Number(canvas.dataset.panY)||0};return;}if(e.button===0){mapEditorPushUndo();mapEditorDragging=true;mapEditorPaintAt(e);}};
    canvas.onmousemove=e=>{if(mapEditorPan){const z=Number(canvas.dataset.zoom)||2;canvas.dataset.panX=mapEditorPan.px-(e.clientX-mapEditorPan.x)/z;canvas.dataset.panY=mapEditorPan.py-(e.clientY-mapEditorPan.y)/z;mapEditorRender();return;}if(mapEditorDragging)mapEditorPaintAt(e);};
    window.addEventListener("mouseup",e=>{if(e.button===0||e.button===2)mapEditorDragging=false;if(e.button===1)mapEditorPan=null;});
    canvas.onwheel=e=>{e.preventDefault();const z=Math.max(.5,Math.min(6,(Number(canvas.dataset.zoom)||2)*(e.deltaY<0?1.1:.9)));canvas.dataset.zoom=z;mapEditorRender();};
}

function openMapEditor(){
    mapEditorBuildUi();if(typeof closeDevMenu==="function")closeDevMenu();document.getElementById("map-editor-root").classList.remove("hidden");mapEditorRender();mapEditorLoadRuntimeImages();
}
function mapEditorClose(){
    if(mapEditorTestMode){
        const m=mapEditorCurrent();
        if(m&&mapEditorTestSnapshot){const i=mapEditorMaps.findIndex(x=>x.id===m.id);if(i>=0)mapEditorMaps[i]=normalizeMapEditorMap(mapEditorTestSnapshot.map);mapEditorOpenedObjectIds=new Set(mapEditorTestSnapshot.opened);mapEditorPersist();mapEditorApplyRuntime();}
        mapEditorTestMode=false;mapEditorTestSnapshot=null;
        if(typeof stopOverworldMode==="function")stopOverworldMode();
        if(typeof openMapEditor==="function")openMapEditor();
        return;
    }
    const r=document.getElementById("map-editor-root");if(r)r.classList.add("hidden");
}
function mapEditorAddDevButton(){
    const main=document.getElementById("dev-menu-main");if(!main||document.getElementById("dev-cat-maps"))return;
    const b=document.createElement("button");b.id="dev-cat-maps";b.className="secondary-button";b.type="button";b.textContent="🗺 Créateur de Map";main.insertBefore(b,document.getElementById("dev-export-disk-btn"));b.onclick=openMapEditor;
}

document.addEventListener("DOMContentLoaded",()=>{
    mapEditorLoadMaps();mapEditorApplyRuntime();mapEditorBuildUi();mapEditorAddDevButton();mapEditorLoadRuntimeImages();
    document.addEventListener("keydown",e=>{
        if(typeof isKeybindCaptureActive==="function"&&isKeybindCaptureActive()){e.preventDefault();e.stopPropagation();return;}
        if(e.key==="e"&&!document.getElementById("map-editor-root")?.classList.contains("hidden")&&document.activeElement?.tagName!=="INPUT"&&document.activeElement?.tagName!=="TEXTAREA")mapEditorInteract();
        if(e.key==="Escape"&&(mapEditorTestMode||!document.getElementById("map-editor-root")?.classList.contains("hidden"))){e.preventDefault();mapEditorClose();}
        if(typeof isWorldScreenActive==="function"&&isWorldScreenActive()&&!mapEditorTestMode&&typeof getKeyAction==="function"&&getKeyAction(e.key)==="confirm"){mapEditorInteract();}
    });
});

