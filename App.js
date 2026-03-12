import 'react-native-get-random-values';
import React, { useState, useEffect, useCallback } from 'react';
import * as Linking from 'expo-linking';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  SafeAreaView, 
  Modal, 
  Alert,
  ActivityIndicator,
  Platform,
  Clipboard
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import uuid from 'react-native-uuid';
import { 
  doc, 
  onSnapshot, 
  setDoc, 
  updateDoc, 
  arrayUnion, 
  arrayRemove, 
  collection, 
  getDocs,
  query,
  where,
  limit
} from 'firebase/firestore';
import { db } from './firebaseConfig';
import { performFuzzySearch, calculatePriceComparison } from './fuzzySearch';
import Fuse from 'fuse.js';

// Constants
const STORAGE_KEY = '@grocery_list_code';

export default function App() {
  const [listCode, setListCode] = useState(null);
  const [inputCode, setInputCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [groceryItems, setGroceryItems] = useState([]);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [allPrices, setAllPrices] = useState([]); // Global prices for comparison
  const [comparison, setComparison] = useState([]);
  const [itemMatches, setItemMatches] = useState({});
  const [shareFeedback, setShareFeedback] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimeout = React.useRef(null);

  // 1. Check for list code in URL or storage on mount
  useEffect(() => {
    const initializeList = async () => {
      // 1a. Check URL for code (e.g., ?list=ABCDEF)
      const url = await Linking.getInitialURL();
      const { queryParams } = Linking.parse(url || '');
      const urlCode = queryParams?.list;

      if (urlCode && urlCode.length === 6) {
        await AsyncStorage.setItem(STORAGE_KEY, urlCode);
        setListCode(urlCode);
        setLoading(false);
        return;
      }

      // 1b. Check local storage
      const savedCode = await AsyncStorage.getItem(STORAGE_KEY);
      if (savedCode) {
        setListCode(savedCode);
      }
      setLoading(false);
    };

    initializeList();
  }, []);

  // 2. Fetch Master Products & Listen to Firestore
  useEffect(() => {
    if (!listCode) return;

    // 2a. Fetch only relevant prices for the items ALREADY in the list
    const fetchListPrices = async () => {
      if (groceryItems.length === 0) return;
      try {
        const barcodes = groceryItems.map(i => i.barcode).filter(Boolean);
        const names = groceryItems.filter(i => !i.barcode).map(i => i.name);
        
        let fetchedPrices = [];
        
        // Fetch by barcode
        if (barcodes.length > 0) {
          const q = query(collection(db, 'master_catalog'), where('__name__', 'in', barcodes));
          const snap = await getDocs(q);
          snap.forEach(doc => {
            const data = doc.data();
            Object.entries(data.prices || {}).forEach(([chainId, price]) => {
              fetchedPrices.push({ name: data.name, barcode: doc.id, chain_id: chainId, price });
            });
          });
        }
        
        setAllPrices(fetchedPrices);
      } catch (err) {
        console.error("Error fetching list prices:", err);
      }
    };
    fetchListPrices();

    // Listen to the specific list
    const unsubscribe = onSnapshot(doc(db, 'shared_lists', listCode), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setGroceryItems(data.items || []);
      } else {
        setDoc(doc(db, 'shared_lists', listCode), { items: [], created_at: new Date() });
      }
    });

    return () => unsubscribe();
  }, [listCode, groceryItems.length]);

  // 3. Update Price Comparison and Item Matches
  useEffect(() => {
    if (groceryItems.length > 0 && allPrices.length > 0) {
      const results = calculatePriceComparison(groceryItems, allPrices);
      setComparison(results);

      const matches = {};
      const uniqueProducts = [];
      const barcodeSeen = new Set();
      const namesSeen = new Set();

      allPrices.forEach(p => {
        if (p.barcode && !barcodeSeen.has(p.barcode)) {
          uniqueProducts.push({ name: p.name, barcode: p.barcode });
          barcodeSeen.add(p.barcode);
        } else if (!p.barcode && !namesSeen.has(p.name)) {
          uniqueProducts.push({ name: p.name, barcode: null });
          namesSeen.add(p.name);
        }
      });
      
      const fuse = new Fuse(uniqueProducts, { 
        keys: [
          { name: 'name', weight: 0.7 },
          { name: 'brand', weight: 0.3 }
        ], 
        threshold: 0.35 
      });
      
      groceryItems.forEach(item => {
        // Priority 1: Match by exact barcode
        if (item.barcode) {
          const barcodeMatch = uniqueProducts.find(up => up.barcode === item.barcode);
          if (barcodeMatch) {
            matches[item.name] = { name: barcodeMatch.name, barcode: item.barcode };
            return;
          }
        }

        // Priority 2: Match by fuzzy name
        const result = fuse.search(item.name);
        if (result.length > 0) {
          matches[item.name] = { name: result[0].item.name, barcode: result[0].item.barcode };
        }
      });
      setItemMatches(matches);
    } else {
      setComparison([]);
      setItemMatches({});
    }
  }, [groceryItems, allPrices]);

  // Actions
  const handleGenerateCode = async () => {
    const newCode = uuid.v4().toString().substring(0, 6).toUpperCase();
    await saveSession(newCode);
  };

  const handleJoinList = async () => {
    if (inputCode.length === 6) {
      await saveSession(inputCode.toUpperCase());
    } else {
      Alert.alert("קוד לא תקין", "אנא הכנס קוד בעל 6 תווים.");
    }
  };

  const saveSession = async (code) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, code);
      setListCode(code);
    } catch (e) {
      Alert.alert("שגיאת אחסון", "נכשל בשמירת המפגש.");
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setListCode(null);
    setGroceryItems([]);
  };

  const addItemToFirestore = async (item) => {
    try {
      const listRef = doc(db, 'shared_lists', listCode);
      await updateDoc(listRef, {
        items: arrayUnion({
          id: Math.random().toString(36).substr(2, 9),
          name: item.name,
          product_id: item.id || null,
          barcode: item.barcode || item.product_id || null,
          checked: false,
          quantity: 1
        })
      });
      setShowSearchModal(false);
      setSearchQuery('');
    } catch (e) {
      Alert.alert("שגיאה", "נכשל בהוספת המוצר.");
    }
  };

  const handleSimpleAdd = () => {
    if (searchQuery.trim().length > 0) {
      addItemToFirestore({ name: searchQuery.trim() });
    }
  };

  const toggleItem = async (item) => {
    const listRef = doc(db, 'shared_lists', listCode);
    const updatedItems = groceryItems.map(i => 
      i.id === item.id ? { ...i, checked: !i.checked } : i
    );
    await updateDoc(listRef, { items: updatedItems });
  };

  const deleteItem = async (item) => {
    const listRef = doc(db, 'shared_lists', listCode);
    await updateDoc(listRef, {
      items: arrayRemove(item)
    });
  };

  const clearList = async () => {
    const performClear = async () => {
      try {
        const listRef = doc(db, 'shared_lists', listCode);
        await updateDoc(listRef, { items: [] });
      } catch (e) {
        Alert.alert("שגיאה", "נכשל בניקוי הרשימה.");
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm("האם אתה בטוח שברצונך למחוק את כל המוצרים ברשימה?")) {
        await performClear();
      }
    } else {
      Alert.alert(
        "נקה רשימה",
        "האם אתה בטוח שברצונך למחוק את כל המוצרים?",
        [
          { text: "ביטול", style: "cancel" },
          { text: "נקה הכל", style: "destructive", onPress: performClear }
        ]
      );
    }
  };

  const handleShareLink = () => {
    const shareUrl = Linking.createURL('/', {
      queryParams: { list: listCode },
    });
    
    Clipboard.setString(shareUrl);
    setShareFeedback(true);
    setTimeout(() => setShareFeedback(false), 2000);
  };

  const handleSearch = (text) => {
    setSearchQuery(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);

    if (text.length > 1) {
      setSearchLoading(true);
      searchTimeout.current = setTimeout(async () => {
        try {
          // Firestore prefix search (e.g., "חלב" -> codes starting with "חלב")
          // Note: This requires a custom approach since Firestore doesn't provide native fuzzy search.
          // For true scale, we'd use Algolia. For now, we fetch top 30 matches starting with the prefix.
          const q = query(
            collection(db, 'master_catalog'),
            where('name', '>=', text),
            where('name', '<=', text + '\uf8ff'),
            limit(30)
          );
          const snap = await getDocs(q);
          const results = snap.docs.map(doc => {
            const data = doc.data();
            const prices = Object.values(data.prices || {});
            return {
              id: doc.id,
              barcode: doc.id,
              ...data,
              minPrice: prices.length > 0 ? Math.min(...prices) : 0
            };
          });
          setSearchResults(results);
        } catch (e) {
          console.error("Search error:", e);
        } finally {
          setSearchLoading(false);
        }
      }, 400); // 400ms debounce
    } else {
      setSearchResults([]);
      setSearchLoading(false);
    }
  };

  // Render Components
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6200ee" />
      </View>
    );
  }

  if (!listCode) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loginCard}>
          <Text style={styles.title}>קניות ישראל</Text>
          <Text style={styles.subtitle}>רשימה משותפת והשוואת מחירים בזמן אמת</Text>
          
          <TextInput
            style={styles.input}
            placeholder="הכנס קוד רשימה (6 תווים)"
            value={inputCode}
            onChangeText={setInputCode}
            autoCapitalize="characters"
            maxLength={6}
          />
          
          <TouchableOpacity style={styles.primaryButton} onPress={handleJoinList}>
            <Text style={styles.buttonText}>הצטרף לרשימה</Text>
          </TouchableOpacity>
          
          <View style={styles.divider}>
            <View style={styles.line} />
            <Text style={styles.dividerText}>או</Text>
            <View style={styles.line} />
          </View>
          
          <TouchableOpacity style={styles.secondaryButton} onPress={handleGenerateCode}>
            <Text style={styles.secondaryButtonText}>צור רשימה משותפת חדשה</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity onPress={logout} style={{ marginRight: 16 }}>
            <Text style={styles.logoutText}>התנתק</Text>
          </TouchableOpacity>
          {groceryItems.length > 0 && (
            <TouchableOpacity onPress={clearList}>
              <Text style={styles.clearText}>נקה רשימה</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.headerTitle}>רשימת הקניות שלי</Text>
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center' }}>
            <Text style={styles.headerSubtitle}>קוד רשימה: {listCode}</Text>
            <TouchableOpacity onPress={handleShareLink} style={styles.shareButton}>
              <Text style={styles.shareText}>{shareFeedback ? 'הועתק!' : 'שתף קישור'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Main List */}
      <FlatList
        data={groceryItems}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <TouchableOpacity 
              style={styles.checkboxArea} 
              onPress={() => toggleItem(item)}
            >
              <View style={[styles.checkbox, item.checked && styles.checked]} />
              <View style={{ alignItems: 'flex-end', flex: 1 }}>
                <Text style={[styles.itemText, item.checked && styles.checkedText]}>
                  {item.name}
                </Text>
                {/* Show the best price if found via fuzzy match */}
                {itemMatches[item.name] && (
                  <Text style={styles.itemPriceLabel}>
                    מחיר ממוצע: ₪{(allPrices.filter(p => 
                      itemMatches[item.name].barcode ? p.barcode === itemMatches[item.name].barcode : p.name === itemMatches[item.name].name
                    ).reduce((acc, curr) => acc + curr.price, 0) / 
                      (allPrices.filter(p => 
                        itemMatches[item.name].barcode ? p.barcode === itemMatches[item.name].barcode : p.name === itemMatches[item.name].name
                      ).length || 1)).toFixed(2)}
                  </Text>
                )}
                {!itemMatches[item.name] && allPrices.length > 0 && (
                  <Text style={[styles.itemPriceLabel, { color: '#ff4d4f' }]}>
                    לא נמצא מחיר במאגר
                  </Text>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => deleteItem(item)}>
              <Text style={styles.deleteIcon}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>העגלה שלך ריקה</Text>
            <Text style={styles.emptySubtext}>לחץ על ה- "+" למטה כדי להוסיף מוצרים</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />

      {/* Comparison View */}
      {comparison.length > 0 && (
        <View style={styles.comparisonTray}>
          <Text style={styles.trayTitle}>השוואת מחירים</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row-reverse' }}>
            {comparison.map((c, idx) => (
              <View key={c.chainId} style={[styles.comparisonCard, idx === 0 && styles.cheapestCard]}>
                {idx === 0 && <View style={styles.badge}><Text style={styles.badgeText}>המשתלם ביותר</Text></View>}
                <Text style={styles.chainId}>{c.chainId}</Text>
                <Text style={styles.totalPrice}>₪{c.total}</Text>
                <Text style={styles.stats}>{c.itemCount}/{groceryItems.length} מוצרים</Text>
                {c.missingItems.length > 0 && (
                   <Text style={styles.missingCount}>{c.missingItems.length} חסרים</Text>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* FAB */}
      <TouchableOpacity 
        style={styles.fab} 
        onPress={() => setShowSearchModal(true)}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>

      {/* Search Modal */}
      <Modal visible={showSearchModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowSearchModal(false)}>
              <Text style={styles.closeText}>ביטול</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>הוסף מוצר</Text>
          </View>
          
          <TextInput
            style={styles.searchInput}
            placeholder="הקלד שם מוצר (למשל: חלב)..."
            autoFocus
            value={searchQuery}
            onChangeText={handleSearch}
            onSubmitEditing={handleSimpleAdd}
            returnKeyType="done"
          />
          
          {searchQuery.length > 0 && (
            <TouchableOpacity 
              style={styles.mainAddButton}
              onPress={handleSimpleAdd}
            >
              <Text style={styles.mainAddButtonText}>+ הוסף "{searchQuery}" לרשימה</Text>
            </TouchableOpacity>
          )}

          <Text style={styles.suggestionTitle}>{searchQuery.length > 1 ? 'הצעות ממאגר המחירים:' : 'הקלד לחיפוש מוצרים...'}</Text>
          
          {searchLoading ? (
            <ActivityIndicator size="small" color="#6200ee" style={{ marginTop: 20 }} />
          ) : (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.barcode}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.searchResultItem} onPress={() => addItemToFirestore(item)}>
                  <View style={{ alignItems: 'flex-end' }}>
                     <Text style={styles.resultName}>{item.name}</Text>
                     <Text style={styles.resultDetail}>{item.brand} • {item.barcode}</Text>
                     <Text style={styles.searchPrice}>החל מ-₪{item.minPrice.toFixed(2)}</Text>
                  </View>
                  <Text style={styles.addIcon}>+</Text>
                </TouchableOpacity>
              )}
              ListHeaderComponent={null}
              ListEmptyComponent={searchQuery.length > 1 ? <Text style={styles.noResults}>לא נמצאו מוצרים</Text> : null}
            />
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Login Styles
  loginCard: {
    padding: 30,
    margin: 20,
    backgroundColor: '#fff',
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
    marginTop: 100,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
    marginBottom: 32,
  },
  input: {
    backgroundColor: '#f1f3f5',
    padding: 16,
    borderRadius: 12,
    fontSize: 18,
    textAlign: 'center',
    fontWeight: '600',
    marginBottom: 16,
    letterSpacing: 2,
  },
  primaryButton: {
    backgroundColor: '#6200ee',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: '#dee2e6',
  },
  dividerText: {
    marginHorizontal: 16,
    color: '#adb5bd',
    fontSize: 12,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 2,
    borderColor: '#6200ee',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#6200ee',
    fontSize: 14,
    fontWeight: '600',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f5',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#6c757d',
  },
  logoutText: {
    color: '#adb5bd',
    fontWeight: '600',
  },
  clearText: {
    color: '#ff4d4f',
    fontWeight: '600',
  },
  shareButton: {
    marginRight: 8,
    backgroundColor: '#f1f3f5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  shareText: {
    fontSize: 11,
    color: '#6200ee',
    fontWeight: '700',
  },
  // List Styles
  listContent: {
    padding: 16,
    paddingBottom: 250, // Space for comparison tray
  },
  itemRow: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  checkboxArea: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    flex: 1,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#dee2e6',
    marginLeft: 12,
  },
  checked: {
    backgroundColor: '#6200ee',
    borderColor: '#6200ee',
  },
  itemText: {
    fontSize: 16,
    color: '#343a40',
    textAlign: 'right',
  },
  checkedText: {
    textDecorationLine: 'line-through',
    color: '#adb5bd',
  },
  deleteIcon: {
    fontSize: 18,
    color: '#adb5bd',
    padding: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#adb5bd',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#ced4da',
    marginTop: 8,
  },
  // Comparison Tray
  comparisonTray: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: 20,
    paddingTop: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  trayTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    color: '#1a1a1a',
    textAlign: 'right',
  },
  comparisonCard: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 16,
    marginLeft: 12,
    minWidth: 140,
    borderWidth: 1,
    borderColor: '#f1f3f5',
    alignItems: 'flex-end',
  },
  cheapestCard: {
    backgroundColor: '#6200ee10',
    borderColor: '#6200ee30',
  },
  badge: {
    position: 'absolute',
    top: -10,
    left: 10,
    backgroundColor: '#40c057',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 8,
    fontWeight: '900',
  },
  chainId: {
    fontSize: 14,
    fontWeight: '600',
    color: '#495057',
  },
  totalPrice: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1a1a1a',
    marginVertical: 4,
  },
  stats: {
    fontSize: 11,
    color: '#868e96',
  },
  missingCount: {
    fontSize: 10,
    color: '#ff4d4f',
    marginTop: 4,
  },
  // FAB
  fab: {
    position: 'absolute',
    bottom: 180, // Above comparison tray
    left: 20,
    backgroundColor: '#6200ee',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6200ee',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  fabText: {
    fontSize: 32,
    color: '#fff',
    fontWeight: '300',
  },
  // Search Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeText: {
    color: '#6200ee',
    fontWeight: '600',
  },
  searchInput: {
    backgroundColor: '#f1f3f5',
    margin: 20,
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    textAlign: 'right',
  },
  searchResultItem: {
    flexDirection: 'row-reverse',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f5',
  },
  resultName: {
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'right',
  },
  resultDetail: {
    fontSize: 12,
    color: '#adb5bd',
    textAlign: 'right',
  },
  addIcon: {
    fontSize: 24,
    color: '#6200ee',
    fontWeight: '300',
  },
  customAddButton: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    margin: 20,
    borderRadius: 12,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#6200ee',
  },
  customAddText: {
    color: '#6200ee',
    fontWeight: '600',
  },
  suggestionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#adb5bd',
    marginHorizontal: 20,
    marginBottom: 8,
    textAlign: 'right',
  },
  mainAddButton: {
    backgroundColor: '#6200ee',
    marginHorizontal: 20,
    marginBottom: 20,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#6200ee',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  noResults: {
    textAlign: 'center',
    marginTop: 40,
    color: '#adb5bd',
    fontSize: 16,
  },
  mainAddButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  searchPrice: {
    fontSize: 14,
    color: '#40c057',
    fontWeight: '700',
    marginTop: 4,
  },
  itemPriceLabel: {
    fontSize: 12,
    color: '#868e96',
    marginTop: 2,
  }
});
