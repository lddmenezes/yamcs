package org.yamcs.xtceproc;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.yamcs.ConfigurationException;
import org.yamcs.YConfiguration;
import org.yamcs.utils.YObjectLoader;
import org.yamcs.xtce.NameReference;
import org.yamcs.xtce.Algorithm;
import org.yamcs.xtce.DatabaseLoadException;
import org.yamcs.xtce.MetaCommand;
import org.yamcs.xtce.NameDescription;
import org.yamcs.xtce.NameReference.Type;
import org.yamcs.xtce.NonStandardData;
import org.yamcs.xtce.Parameter;
import org.yamcs.xtce.ParameterType;
import org.yamcs.xtce.SequenceContainer;
import org.yamcs.xtce.SpaceSystem;
import org.yamcs.xtce.SpaceSystemLoader;
import org.yamcs.xtce.SystemParameter;
import org.yamcs.xtce.XtceDb;


public class XtceDbFactory {

    static Logger log = LoggerFactory.getLogger(XtceDbFactory.class);

    /**
     * map instance names and config names to databases
     */
    static transient Map<String, XtceDb> instance2Db = new HashMap<>();
    static transient Map<String, Map<String, XtceDb>> instance2DbConfigs = new HashMap<>();

    /**
     * Creates a new instance of the database in memory. configSection is the
     * top heading under which this appears in the mdb.yaml
     *
     * @throws ConfigurationException
     */
    public static synchronized XtceDb createInstanceByConfig(String configSection) throws ConfigurationException {
        return createInstanceByConfig(configSection, true);
    }

    public static synchronized XtceDb createInstanceByConfig(String configSection, boolean attemptToLoadSerialized) throws ConfigurationException {
        YConfiguration c = YConfiguration.getConfiguration("mdb");

        if(configSection == null) {
            configSection = c.getFirstEntry();
        }

        List<Object> list = c.getList(configSection);
        return createInstance(list, attemptToLoadSerialized, true);
    }

    /**
     * Load a XTCE database from a description.
     * 
     * 
     * @param treeConfig - this should be a list of maps as it would come out of the mdb.yaml definition.
     * @param attemptToLoadSerialized - if true, it will attempt to load a serialized version from the disk 
     *        instead of creating a new object by loading all elements from the tree definition. 
     * @param saveSerialized - if the result should be saved as a serialized file. 
     *        If the database has been loaded from a serialized file, this option will have no effect.
     * @return a newly created XTCE database object.
     * @throws ConfigurationException
     */
    @SuppressWarnings("unchecked")
    public static synchronized XtceDb createInstance(List<Object> treeConfig, boolean attemptToLoadSerialized, boolean saveSerialized) throws ConfigurationException {
        LoaderTree loaderTree = new LoaderTree(new RootSpaceSystemLoader());

        for(Object o: treeConfig) {
            if(o instanceof Map) {
                loaderTree.addChild(getLoaderTree((Map<String, Object>) o));
            } else {
                throw new ConfigurationException("Expected type Map instead of "+o.getClass());
            }
        }

        boolean loadSerialized = attemptToLoadSerialized;
        boolean serializedLoaded = false;
        String filename = loaderTree.getConfigName()+".xtce";

        if (loadSerialized) {
            if (new File(getFullName(filename) + ".serialized").exists()) {
                try(RandomAccessFile raf = new RandomAccessFile(getFullName(filename) + ".consistency_date", "r")) {                
                    if(loaderTree.needsUpdate(raf)) {
                        loadSerialized = false;
                    }
                } catch (IOException e) {
                    if (new File(getFullName(filename) + ".serialized").exists()) {
                        log.warn("can't check the consistency date of the serialized database", e);
                    }
                    loadSerialized = false;
                } 
            } else {
                loadSerialized = false;
            }
        }

        XtceDb db = null;
        if (loadSerialized) {
            try {
                db = loadSerializedInstance(getFullName(filename) + ".serialized");
                serializedLoaded = true;
            } catch (Exception e) {
                log.info("Cannot load serialized database", e);
                db = null;
            }
        }

        if (db == null) {
            //Construct a Space System with one branch from the config file and the other one /yamcs for system variables
            SpaceSystem rootSs = loaderTree.load();
            SpaceSystem yamcsSs = new SpaceSystem(XtceDb.YAMCS_SPACESYSTEM_NAME.substring(1));
            yamcsSs.setQualifiedName(XtceDb.YAMCS_SPACESYSTEM_NAME);

            rootSs.addSpaceSystem(yamcsSs);

            int n;
            while((n=resolveReferences(rootSs, rootSs))>0 ){}


            StringBuilder sb=new StringBuilder();
            collectUnresolvedReferences(rootSs, sb);
            if(n==0) {
                throw new ConfigurationException("Cannot resolve (circular?) references: "+ sb.toString());
            }
            setQualifiedNames(rootSs, "");
            db = new XtceDb(rootSs);

            //set the root sequence container as the first root sequence container found in the sub-systems.
            for(SpaceSystem ss: rootSs.getSubSystems()) {
                SequenceContainer seqc = ss.getRootSequenceContainer();
                if(seqc!=null){
                    db.setRootSequenceContainer(seqc);
                }
            }

            db.buildIndexMaps();
        }

        if (saveSerialized && (!serializedLoaded)) {
            try {
                saveSerializedInstance(loaderTree, db, filename);
                log.info("Serialized database saved locally");
            } catch (Exception e) {
                log.warn("Cannot save serialized MDB", e);
            }
        }

        return db;
    }

    /*collects a description for all unresolved references into the StringBuffer to raise an error*/
    private static void collectUnresolvedReferences(SpaceSystem ss, StringBuilder sb) {
        List<NameReference> refs = ss.getUnresolvedReferences();
        if(refs!=null) {
            for(NameReference nr: ss.getUnresolvedReferences()) {
                sb.append("system").append(ss.getName()).append(" ").append(nr.toString()).append("\n");
            }
        }
        for(SpaceSystem ss1:ss.getSubSystems()) {
            collectUnresolvedReferences(ss1, sb);
        }
    }

    /**
     * resolves references in ss by going recursively to all sub-space systems (in the first call ss=rootSs)
     *
     * @param ss
     * @param sysDb
     * @return the number of references resolved or -1 if there was no reference to be resolved
     */
    private static int resolveReferences(SpaceSystem rootSs, SpaceSystem ss) throws ConfigurationException {
        List<NameReference> refs = ss.getUnresolvedReferences();

        //This can happen when we deserialise the SpaceSystem since the unresolved references is a transient list.
        if(refs==null) {
            refs = Collections.emptyList();
        }

        int n = (refs.size()==0)?-1:0;

        Iterator<NameReference> it = refs.iterator();
        while (it.hasNext()) {
            NameReference nr = it.next();

            NameDescription nd = findReference(rootSs, nr, ss);
            if(nd==null && nr.getType()==Type.PARAMETER && nr.getReference().startsWith(XtceDb.YAMCS_SPACESYSTEM_NAME)) {
                //Special case for system parameters: they are created on the fly
                String fqname = nr.getReference();
                SystemParameter sp = SystemParameter.getForFullyQualifiedName(fqname);

                String ssname = sp.getSubsystemName();
                String[] a = ssname.split("/");
                SpaceSystem ss1 = rootSs;
                for(String name:a) {
                    if(name.isEmpty()) {
                        continue;
                    }
                    SpaceSystem ss2 = ss1.getSubsystem(name);
                    if(ss2 == null) {
                        ss2 = new SpaceSystem(name);
                        ss1.addSpaceSystem(ss2);
                    }
                    ss1 = ss2;
                }
                ss1.addParameter(sp);
                nd = sp;
            } 
            if(nd == null) { //look for aliases up the hierarchy
                nd = findAliasReference(rootSs, nr, ss);
            }
            if(nd==null) {
                throw new ConfigurationException("Cannot resolve reference SpaceSystem: "+ss.getName()+" "+nr);
            }
            if(nr.resolved(nd)) {
                n++;
                it.remove();
            }
        }
        for(SpaceSystem ss1:ss.getSubSystems()) {
            int m = resolveReferences(rootSs, ss1);
            if(n==-1) {
                n = m;
            } else if(m>0) {
                n+=m;
            }
        }
        return n;
    }



    /**
     * find the reference nr mentioned in the space system ss by looking either in root (if absolute reference) 
     *  or in the parent hierarchy if relative reference
     *
     * @param rootSs
     * @param nr
     * @param ss
     * @return
     */
    static NameDescription findReference(SpaceSystem rootSs, NameReference nr, SpaceSystem ss) {
        String ref = nr.getReference();
        boolean absolute = false;
        SpaceSystem startSs = null;

        if(ref.startsWith("/")) {
            absolute=true;
            startSs=rootSs;
        } else if(ref.startsWith("./")|| ref.startsWith("..")) {
            absolute=true;
            startSs=ss;
        }

        if(absolute) {
            return findReference(startSs, nr);
        } else {
            //go up until the root
            NameDescription nd=null;
            startSs=ss;
            while(true) {
                nd=findReference(startSs, nr);
                if((nd!=null) || (startSs==rootSs)){
                    break;
                }
                startSs = startSs.getParent();
            }
            return nd;
        }
    }

    /**
     * searches for aliases in the parent hierarchy
     * @param rootSs
     * @param nr
     * @param ss
     * @return
     */
    static NameDescription findAliasReference(SpaceSystem rootSs, NameReference nr, SpaceSystem startSs) {
        //go up until the root
        NameDescription nd=null;
        SpaceSystem ss = startSs;
        while(true) {
            nd = findAliasReference(ss, nr);
            if((nd!=null) || (ss==rootSs)){
                break;
            }
            ss = ss.getParent();
        }
        return nd;
    }



    /**
     * find reference starting at startSs and looking through the SpaceSystem path
     * @param startSs
     * @param nr
     * @return
     */
    private static NameDescription findReference(SpaceSystem startSs, NameReference nr) {
        String[] path=nr.getReference().split("/");
        SpaceSystem ss=startSs;

        for(int i=0; i<path.length-1; i++) {
            if(".".equals(path[i]) || "".equals(path[i])) {
                continue;
            } else if("..".equals(path[i])) {
                ss=ss.getParent();
                if(ss==null) {
                    break; //this can only happen if the root has no parent (normally it's its own parent)
                }
                continue;
            }

            if(i==path.length-1) {
                break;
            }

            ss = ss.getSubsystem(path[i]);

            if(ss==null) {
                break;
            }
        }
        if(ss==null) {
            return null;
        }

        String name=path[path.length-1];
        switch(nr.getType()) {
        case PARAMETER:
            return ss.getParameter(name);
        case PARAMETER_TYPE:
            return (NameDescription) ss.getParameterType(name);
        case SEQUENCE_CONTAINTER:
            return ss.getSequenceContainer(name);
        case META_COMMAND:
            return ss.getMetaCommand(name);
        case ALGORITHM:
            return ss.getAlgorithm(name);
        }
        //shouldn't arrive here
        return null;
    }

    /**
     * looks in the SpaceSystem ss for a namedObject with the given alias. 
     * Prints a warning in case multiple references are found and returns the first one.
     *  
     * If none is found, returns null.
     * @param ss
     * @param nr
     * @return
     */
    private static NameDescription findAliasReference(SpaceSystem ss, NameReference nr) {

        String alias = nr.getReference();
        List<? extends NameDescription> l;
        switch(nr.getType()) {
        case PARAMETER:
            l = ss.getParameterByAlias(alias);
            break;
        case SEQUENCE_CONTAINTER:
            l =ss.getSequenceContainerByAlias(alias);
            break;
        case META_COMMAND:
            l =ss.getMetaCommandByAlias(alias);
            break;
        default:
            return null;
        }

        if(l==null || l.isEmpty()) {
            return null;
        } else if(l.size()>1) {
            log.warn("When looking for aliases '{}' found multiple matches: ", nr, l);
        }
        return l.get(0);
    }



    @SuppressWarnings({ "unchecked" })
    private static LoaderTree getLoaderTree(Map<String,Object> m) throws ConfigurationException {
        String type=YConfiguration.getString(m, "type");
        Object args=null;
        if(m.containsKey("args")) {
            args=m.get("args");
        } else if(m.containsKey("spec")) {
            args=m.get("spec");
        }

        SpaceSystemLoader l;
        LoaderTree ltree;

        if ("xtce".equals(type)) {
            type = "org.yamcs.xtce.XtceLoader";
        } else if ("sheet".equals(type)) {
            type = "org.yamcs.xtce.SpreadsheetLoader";
        }
        try {
            l = YObjectLoader.loadObject(type, args);
        } catch (Exception e) {
            log.warn(e.toString());
            throw new ConfigurationException("Cannot load xtce database: " + e.getMessage(), e);
        }


        ltree=new LoaderTree(l);

        if(m.containsKey("subLoaders")) {
            List<Object> list=YConfiguration.getList(m, "subLoaders");
            for(Object o: list) {
                if(o instanceof Map) {
                    ltree.addChild(getLoaderTree((Map<String, Object>) o));
                } else {
                    throw new ConfigurationException("Expected type Map instead of "+o.getClass());
                }
            }
        }

        return ltree;
    }

    /**
     * Propagates qualified name to enclosing objects including subsystems. Also
     * registers aliases under each subsystem.
     */
    private static void setQualifiedNames(SpaceSystem ss, String parentqname) {
        String ssqname;
        if(String.valueOf(NameDescription.PATH_SEPARATOR).equals(parentqname)) { //parent is root
            ssqname = NameDescription.PATH_SEPARATOR+ss.getName();
        } else {
            ssqname = parentqname+NameDescription.PATH_SEPARATOR+ss.getName();
        }

        ss.setQualifiedName(ssqname);

        if (!"".equals(parentqname)) {
            ss.addAlias(parentqname, ss.getName());
        }
        for(Parameter p: ss.getParameters()) {
            p.setQualifiedName(ss.getQualifiedName()+NameDescription.PATH_SEPARATOR + p.getName());
        }
        for(ParameterType pt: ss.getParameterTypes()) {
            NameDescription nd=(NameDescription)pt;
            nd.setQualifiedName(ss.getQualifiedName() + NameDescription.PATH_SEPARATOR + nd.getName());
        }

        for(SequenceContainer c: ss.getSequenceContainers()) {
            c.setQualifiedName(ss.getQualifiedName() + NameDescription.PATH_SEPARATOR + c.getName());
        }

        for(MetaCommand c: ss.getMetaCommands()) {
            c.setQualifiedName(ss.getQualifiedName() + NameDescription.PATH_SEPARATOR + c.getName());
        }

        for(Algorithm a: ss.getAlgorithms()) {
            a.setQualifiedName(ss.getQualifiedName() + NameDescription.PATH_SEPARATOR + a.getName());
        }

        for(NonStandardData<?> nonStandardData: ss.getNonStandardData()) {
            nonStandardData.setSpaceSystemQualifiedName(ss.getQualifiedName());
        }

        for(SpaceSystem ss1:ss.getSubSystems()) {
            setQualifiedNames(ss1, ss.getQualifiedName());
        }
    }

    private static XtceDb loadSerializedInstance(String filename) throws IOException, ClassNotFoundException {
        ObjectInputStream in = null;
        log.debug("Loading serialized XTCE DB from: {}", filename);
        in = new ObjectInputStream(new FileInputStream(filename));
        XtceDb db = (XtceDb) in.readObject();
        in.close();
        log.info("Loaded XTCE DB from {} with {} containers, {} parameters and {} commands",
                filename, db.getSequenceContainers().size(), db.getParameterNames().size(), db.getMetaCommands().size());
        return db;
    }

    private static String getFullName(String filename) throws ConfigurationException {
        return new File(YConfiguration.getGlobalProperty("cacheDirectory"), filename).getAbsolutePath();
    }

    private static void saveSerializedInstance(LoaderTree loaderTree, XtceDb db, String filename) throws IOException, ConfigurationException {
        OutputStream os = null;
        ObjectOutputStream out = null;

        os = new FileOutputStream(getFullName(filename) + ".serialized");

        out = new ObjectOutputStream(os);
        out.writeObject(db);
        out.close();
        FileWriter fw = new FileWriter(getFullName(filename) + ".consistency_date");
        loaderTree.writeConsistencyDate(fw);
        fw.close();
    }

    /**
     * retrieves the XtceDb for the corresponding yamcsInstance.
     * if yamcsInstance is null, then the first one in the mdb.yaml config file is loaded
     * @param yamcsInstance
     * @return
     * @throws ConfigurationException
     * @throws DatabaseLoadException
     */
    public static synchronized XtceDb getInstance(String yamcsInstance) throws ConfigurationException {
        XtceDb db = instance2Db.get(yamcsInstance);
        if (db == null) {
            YConfiguration c = YConfiguration.getConfiguration("yamcs."+yamcsInstance);
            if (c.isList("mdb")) {
                db = createInstance(c.getList("mdb"), true, true);
                instance2Db.put(yamcsInstance, db);
            } else {
                db = getInstanceByConfig(yamcsInstance, c.getString("mdb"));
                instance2Db.put(yamcsInstance, db);
            }
        }
        return db;
    }

    public static synchronized XtceDb getInstanceByConfig(String yamcsInstance, String config) throws ConfigurationException {
        Map<String, XtceDb> dbConfigs = instance2DbConfigs.get(yamcsInstance);
        if (dbConfigs == null) {
            dbConfigs = new HashMap<>();
            instance2DbConfigs.put(yamcsInstance, dbConfigs);
        }

        XtceDb db = dbConfigs.get(config);
        if(db==null) {
            db = createInstanceByConfig(config);
            dbConfigs.put(config, db);
        }
        return db;
    }
    
    /**
     * 
     * Removes the Xtcedb corresponding to yamcsInstance from memory
     */
    public static synchronized void remove(String yamcsInstance) {
        log.info("Removing the XtceDB for instance {}", yamcsInstance);
        instance2DbConfigs.remove(yamcsInstance);
        instance2Db.remove(yamcsInstance);
    }

    /**
     * forgets any singleton
     */
    public synchronized static void reset() {
        instance2Db.clear();
        instance2DbConfigs.clear();
    }

    static class LoaderTree {
        SpaceSystemLoader root;
        List<LoaderTree> children;

        LoaderTree(SpaceSystemLoader root) {
            this.root=root;
        }


        void addChild(LoaderTree c) {
            if(children==null) {
                children=new ArrayList<LoaderTree>();
            }
            children.add(c);
        }

        /**
         *
         * @return a concatenation of all configs
         * @throws ConfigurationException
         */
        String getConfigName() throws ConfigurationException {
            if(children==null) {
                return root.getConfigName();
            } else {
                StringBuilder sb=new StringBuilder();
                sb.append(root.getConfigName());
                for(LoaderTree c:children) {
                    sb.append("_").append(c.getConfigName());
                }
                return sb.toString();
            }
        }

        /**checks the date in the file and returns true if any of the root or children needs to be updated
         * @throws ConfigurationException
         * @throws IOException */
        public boolean needsUpdate(RandomAccessFile raf) throws IOException, ConfigurationException {
            raf.seek(0);
            if(root.needsUpdate(raf)) {
                return true;
            }
            if(children!=null) {
                for(LoaderTree lt:children) {
                    if(lt.needsUpdate(raf)) {
                        return true;
                    }
                }
            }
            return false;
        }

        public SpaceSystem load() throws ConfigurationException {
            try {
                SpaceSystem rss=root.load();
                if(children!=null) {
                    for(LoaderTree lt:children) {
                        SpaceSystem ss=lt.load();
                        rss.addSpaceSystem(ss);
                        ss.setParent(rss);
                    }
                }
                return rss;
            } catch (ConfigurationException e) {
                throw e;
            }
        }


        public void writeConsistencyDate(FileWriter fw) throws IOException {
            root.writeConsistencyDate(fw);
            if(children!=null) {
                for(LoaderTree lt:children) {
                    lt.writeConsistencyDate(fw);
                }
            }
        }
    }

    //fake loader for the root (empty) space system
    static class RootSpaceSystemLoader implements SpaceSystemLoader {
        @Override
        public boolean needsUpdate(RandomAccessFile consistencyDateFile)   throws IOException, ConfigurationException {
            return false;
        }

        @Override
        public String getConfigName() throws ConfigurationException {
            return "";
        }

        @Override
        public void writeConsistencyDate(FileWriter consistencyDateFile)  throws IOException {
        }

        @Override
        public SpaceSystem load() throws ConfigurationException,  DatabaseLoadException {
            SpaceSystem rootSs = new SpaceSystem("");
            rootSs.setParent(rootSs);
            return rootSs;
        }

    }
}
