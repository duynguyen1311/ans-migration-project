const axios = require("axios");
const {getKiotVietAccessToken} = require("../service/get-access-token");
const {log, logError} = require("../service/log-service");
const { dbService } = require('../service/dbConnection-service');
const seedCategory = require('../mock-data/category.json');
class dataMigrationJob {
    constructor(config, options = {}) {
        this.config = config;

        // Set up dependencies with support for dependency injection
        this.axios = options.axios || axios;
        this.getKiotVietAccessToken = options.getKiotVietAccessToken || getKiotVietAccessToken;
        this.log = options.log || log;
        this.logError = options.logError || logError;
    }

    async main(options) {
        await dbService.connect();
        this.log('✓ Database connected successfully');

        const goodsType = 2;
        const serviceType = 3;

        await this.seedCategories();

        const accessToken = await this.getKiotVietAccessToken();
        this.log('✓ Access token obtained');
        switch (options) {
            case 'customer':
                const customers = await this.fetchCustomer(accessToken);
                this.log(`✓ Retrieved ${customers.length} customers`);
                break;
            case 'goods':
                const goods = await this.fetchProduct(accessToken, goodsType);
                this.log(`✓ Retrieved ${goods.length} goods`);
                break;
            case 'services':
                const service = await this.fetchProduct(accessToken, serviceType);
                this.log(`✓ Retrieved ${service.length} service`);
                break;
            case 'invoices' :
                const invoices = await this.fetchInvoices(accessToken);
                this.log(`✓ Retrieved ${invoices.length} invoices`);
                break;
        }
    }

    async seedCategories() {
        try {
            // Check if item_category table is empty
            const query = 'SELECT COUNT(*) as count FROM item_category';
            const result = await dbService.get(query);
            const categoryCount = parseInt(result[0].count);

            if (categoryCount === 0) {
                this.log('---------Start seeding categories--------');

                // Loop through seedCategory and insert each one
                for (const category of seedCategory) {
                    await this.insertCategory(category);
                }

                this.log(`✓ Seeded ${seedCategory.length} categories successfully`);
            } else {
                this.log(`✓ Categories already exist (${categoryCount} found), skipping seed`);
                return;
            }
        } catch (error) {
            this.logError('Error seeding categories:', error.message);
            throw error;
        }
    }
    async fetchCustomer(accessToken) {
        try {
            this.log(`---------Start fetching customers--------`);
            const listCustomer = [];

            for (let page = 0; page <= 2200; page += 200) {
                this.log('Fetch data for page ' + page);
                const response = await this.axios.get('https://public.kiotapi.com/customers', {
                    headers: {
                        'Retailer': this.config.retailer,
                        'Authorization': `Bearer ${accessToken}`
                    },
                    params: {
                        pageSize: 200,
                        currentItem: page,
                        isActive: true,
                        orderBy: 'code',
                        orderDirection: 'Asc'
                    }
                });
                const rawData = response.data.data;

                for (let customer of rawData) {
                    await this.insertCustomers(customer);
                    listCustomer.push(customer)
                }
            }

            return listCustomer;
        } catch(error) {
            this.logError('Error fetching customers:', error.message);
            throw error;
        }
    }

    async fetchProduct(accessToken, productType) {
        try {
            this.log(`---------Start fetching products with type ${productType}--------`);
            const response = await this.axios.get('https://public.kiotapi.com/products', {
                headers: {
                    'Retailer': this.config.retailer,
                    'Authorization': `Bearer ${accessToken}`
                },
                params: {
                    pageSize: 1000,
                    orderBy: 'code',
                    orderDirection: 'ASC',
                    isActive: true,
                    productType: productType,
                    includeInventory: true
                }
            });
            const rawData = response.data.data;

            if (productType === 2) {
                for ( const good of rawData) {
                    const categoryId = await this.getItemCategoryByName(good.categoryName);
                    await this.insertGoods(good, categoryId);
                }
            } else {
                for ( const service of rawData) {
                    const categoryId = await this.getItemCategoryByName(service.categoryName);
                    await this.insertServices(service, categoryId);
                }
            }


            return rawData;
        } catch(error) {
            this.logError('Error fetching customers:', error.message);
            throw error;
        }
    }

    async fetchInvoices(accessToken) {
        try {
            this.log(`---------Start fetching invoices--------`);
            const response = await this.axios.get('https://public.kiotapi.com/invoices', {
                headers: {
                    'Retailer': this.config.retailer,
                    'Authorization': `Bearer ${accessToken}`
                },
                params: {
                    pageSize: 1000,
                    status: '[1,3]',
                }
            });

            const rawData = response.data.data;
            return rawData;
        } catch(error) {
            this.logError('Error fetching customers:', error.message);
            throw error;
        }
    }

    async getItemCategoryByName(categoryName) {
        try {
            const query = 'SELECT * FROM item_category WHERE name LIKE $1 LIMIT 1';
            const result = await dbService.get(query, [`%${categoryName}%`]);
            return result.length > 0 ? result[0].id : null;
        } catch (error) {
            console.error(`Error getting item category by name: ${error.message}`);
            throw error;
        }
    }

    async insertGoods(goodsData, categoryId = null) {
        try {
            const goodsToInsert = {
                goods_code: goodsData.code,
                name: goodsData.fullName,
                description: goodsData.description || null,
                price: goodsData.basePrice || 0,
                stock_quantity: goodsData.inventories && goodsData.inventories[0] ? goodsData.inventories[0].onHand : 0,
                status: 1,
                category_id: categoryId,
                image_url: goodsData.images && goodsData.images.length > 0 ? goodsData.images[0] : null
            };

            const insertedGoods = await dbService.insert('goods', goodsToInsert);
            this.log(`✓ Inserted goods: ${goodsToInsert.name} (${goodsToInsert.goods_code})`);
            return insertedGoods;
        } catch (error) {
            console.error(`Error inserting goods ${goodsData.code}: ${error.message}`);
            throw error;
        }
    }

    async insertServices(serviceData, categoryId = null) {
        try {
            const serviceToInsert = {
                name: serviceData.fullName,
                service_code: serviceData.code,
                description: serviceData.description || null,
                price: serviceData.basePrice || 0,
                status: 1,
                category_id: categoryId,
                estimated_duration_minutes: 0,
                image_url: serviceData.images && serviceData.images.length > 0 ? serviceData.images[0] : null
            };

            const insertedService = await dbService.insert('service', serviceToInsert);
            this.log(`✓ Inserted service: ${serviceToInsert.name} (${serviceToInsert.service_code})`);
            return insertedService;
        } catch (error) {
            console.error(`Error inserting service ${serviceData.code}: ${error.message}`);
            throw error;
        }
    }

    async insertCustomers(customerData) {
        try {
            const customerToInsert = {
                full_name: customerData.name,
                customer_code: customerData.code,
                phone: customerData.contactNumber || null,
                gender: customerData.gender,
                dob: customerData.birthDate ? new Date(customerData.birthDate) : null,
                created_by: 'system',
            };

            const insertedCustomer = await dbService.insert('customer', customerToInsert);
            this.log(`✓ Inserted customer: ${customerToInsert.full_name} (${customerToInsert.customer_code})`);
            return insertedCustomer;
        } catch (error) {
            console.error(`Error inserting customer ${customerData.code}: ${error.message}`);
            throw error;
        }
    }

    async insertCategory(categoryData) {
        try {

            const insertedCategory = await dbService.insert('item_category', categoryData);
            this.log(`✓ Inserted category: ${categoryData.name}`);
            return insertedCategory;
        } catch (error) {
            console.error(`Error inserting category ${categoryData.name}: ${error.message}`);
            throw error;
        }
    }


}

module.exports = dataMigrationJob;