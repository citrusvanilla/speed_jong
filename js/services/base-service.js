/**
 * Base Service Class
 * Provides common Firebase operations for all services
 */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    Timestamp,
    serverTimestamp,
    increment,
    arrayUnion,
    arrayRemove
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { ErrorHandler } from '../utils/error-handler.js';

/**
 * Base Service for Firebase operations
 */
export class BaseService {
    constructor(db, collectionPath) {
        this.db = db;
        this.collectionPath = collectionPath;
        this.collectionRef = collection(db, collectionPath);
    }
    
    /**
     * Get a single document by ID
     * @param {string} docId - Document ID
     * @returns {Promise<Object>} Document data with id
     */
    async getById(docId) {
        const docRef = doc(this.db, this.collectionPath, docId);
        const docSnap = await getDoc(docRef);
        
        if (!docSnap.exists()) {
            throw ErrorHandler.createError(
                `Document not found: ${docId}`,
                'NOT_FOUND'
            );
        }
        
        return { id: docSnap.id, ...docSnap.data() };
    }
    
    /**
     * Get all documents in collection
     * @returns {Promise<Array>} Array of documents with id
     */
    async getAll() {
        const snapshot = await getDocs(this.collectionRef);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    /**
     * Get documents matching a query
     * @param {Array} conditions - Array of where conditions [[field, operator, value], ...]
     * @param {Object} options - Query options { orderByField, orderDirection, limitCount }
     * @returns {Promise<Array>} Array of matching documents
     */
    async query(conditions = [], options = {}) {
        let q = this.collectionRef;
        
        // Add where clauses
        conditions.forEach(([field, operator, value]) => {
            q = query(q, where(field, operator, value));
        });
        
        // Add orderBy
        if (options.orderByField) {
            q = query(q, orderBy(options.orderByField, options.orderDirection || 'asc'));
        }
        
        // Add limit
        if (options.limitCount) {
            q = query(q, limit(options.limitCount));
        }
        
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    /**
     * Create a new document
     * @param {Object} data - Document data
     * @param {string} docId - Optional document ID (auto-generated if not provided)
     * @returns {Promise<string>} Created document ID
     */
    async create(data, docId = null) {
        const docRef = docId
            ? doc(this.db, this.collectionPath, docId)
            : doc(this.collectionRef);
        
        await setDoc(docRef, {
            ...data,
            createdAt: serverTimestamp()
        });
        
        return docRef.id;
    }
    
    /**
     * Update a document
     * @param {string} docId - Document ID
     * @param {Object} data - Data to update
     * @returns {Promise<void>}
     */
    async update(docId, data) {
        const docRef = doc(this.db, this.collectionPath, docId);
        
        await updateDoc(docRef, {
            ...data,
            updatedAt: serverTimestamp()
        });
    }
    
    /**
     * Delete a document
     * @param {string} docId - Document ID
     * @returns {Promise<void>}
     */
    async delete(docId) {
        const docRef = doc(this.db, this.collectionPath, docId);
        await deleteDoc(docRef);
    }
    
    /**
     * Check if document exists
     * @param {string} docId - Document ID
     * @returns {Promise<boolean>} True if document exists
     */
    async exists(docId) {
        try {
            const docRef = doc(this.db, this.collectionPath, docId);
            const docSnap = await getDoc(docRef);
            return docSnap.exists();
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Subscribe to real-time updates for a document
     * @param {string} docId - Document ID
     * @param {Function} callback - Callback function(data)
     * @returns {Function} Unsubscribe function
     */
    subscribeToDocument(docId, callback) {
        const docRef = doc(this.db, this.collectionPath, docId);
        
        return onSnapshot(docRef, (snapshot) => {
            if (snapshot.exists()) {
                callback({ id: snapshot.id, ...snapshot.data() });
            } else {
                callback(null);
            }
        }, (error) => {
            console.error('Snapshot error:', error);
            callback(null);
        });
    }
    
    /**
     * Subscribe to real-time updates for collection
     * @param {Function} callback - Callback function(documents)
     * @param {Array} conditions - Optional where conditions
     * @returns {Function} Unsubscribe function
     */
    subscribeToCollection(callback, conditions = []) {
        let q = this.collectionRef;
        
        conditions.forEach(([field, operator, value]) => {
            q = query(q, where(field, operator, value));
        });
        
        return onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(docs);
        }, (error) => {
            console.error('Snapshot error:', error);
            callback([]);
        });
    }
    
    /**
     * Batch update multiple documents
     * @param {Array} updates - Array of { docId, data }
     * @returns {Promise<void>}
     */
    async batchUpdate(updates) {
        const promises = updates.map(({ docId, data }) =>
            this.update(docId, data)
        );
        await Promise.all(promises);
    }
    
    /**
     * Get helper for creating Firestore references
     */
    getDocRef(docId) {
        return doc(this.db, this.collectionPath, docId);
    }
    
    /**
     * Firestore utility exports for use by subclasses
     */
    static get Timestamp() { return Timestamp; }
    static get serverTimestamp() { return serverTimestamp; }
    static get increment() { return increment; }
    static get arrayUnion() { return arrayUnion; }
    static get arrayRemove() { return arrayRemove; }
}

